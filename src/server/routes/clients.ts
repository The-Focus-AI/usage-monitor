import { and, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../../db/index.js";
import { clients, usageChecks } from "../../db/schema.js";
import {
	runDiscoveryAndSync,
	runDiscoveryPreview,
} from "../onepassword-discovery.js";
import { runProviderChecks } from "../checker.js";
import { runFullCycle } from "../scheduler.js";
import { getCheckHistory } from "../usage-store.js";
import { clientRegistry } from "../client-registry.js";
import {
	listKeyInventory,
	syncKeyInventoryFromDiscovery,
} from "../key-inventory-store.js";

export const clientRoutes: FastifyPluginAsync = async (server) => {
	// GET /api/clients — list all clients with latest check status per client
	server.get("/api/clients", async (_request, reply) => {
		// Subquery: latest check per client (not per provider — just the most recent overall)
		const latestCheckSubquery = db.$with("latest_check").as(
			db
				.select({
					clientId: usageChecks.clientId,
					status: usageChecks.status,
					checkedAt: usageChecks.checkedAt,
					rn: sql<number>`ROW_NUMBER() OVER (
						PARTITION BY ${usageChecks.clientId}
						ORDER BY ${usageChecks.checkedAt} DESC
					)`.as("rn"),
				})
				.from(usageChecks),
		);

		const result = await db
			.with(latestCheckSubquery)
			.select({
				id: clients.id,
				name: clients.name,
				vaultName: clients.vaultName,
				slug: clients.slug,
				isActive: clients.isActive,
				slackWebhook: clients.slackWebhook,
				discordWebhook: clients.discordWebhook,
				email: clients.email,
				thresholdWarning: clients.thresholdWarning,
				thresholdCritical: clients.thresholdCritical,
				lastSyncedAt: clients.lastSyncedAt,
				createdAt: clients.createdAt,
				lastCheckStatus: sql<string | null>`${latestCheckSubquery}.status`,
				lastCheckAt: sql<string | null>`${latestCheckSubquery}.checked_at`,
			})
			.from(clients)
			.leftJoin(
				latestCheckSubquery,
				and(
					eq(clients.id, sql`${latestCheckSubquery}.client_id`),
					eq(sql`${latestCheckSubquery}.rn`, 1),
				),
			)
			.orderBy(clients.name);

		return reply.send({ clients: result });
	});

	// GET /api/discovery-preview — read cached non-secret key inventory from the database
	server.get("/api/discovery-preview", async (_request, reply) => {
		try {
			const clients = await listKeyInventory();
			return reply.send({ clients });
		} catch (error) {
			_request.log.error(error, "Discovery preview lookup failed");
			return reply.status(500).send({
				error:
					error instanceof Error
						? error.message
						: "Discovery preview lookup failed",
			});
		}
	});

	// POST /api/discovery-preview/refresh — refresh cached key inventory from 1Password
	server.post("/api/discovery-preview/refresh", async (_request, reply) => {
		const masterToken = process.env.OP_SERVICE_ACCOUNT_TOKEN;
		if (!masterToken) {
			return reply.status(503).send({
				error: "OP_SERVICE_ACCOUNT_TOKEN not set",
				message:
					"Set OP_SERVICE_ACCOUNT_TOKEN in environment to enable 1Password discovery",
			});
		}

		try {
			const discovered = await runDiscoveryPreview();
			const clients = await syncKeyInventoryFromDiscovery(discovered);
			return reply.send({ status: "ok", clients });
		} catch (error) {
			_request.log.error(error, "Discovery preview refresh failed");
			return reply.status(500).send({
				error:
					error instanceof Error
						? error.message
						: "Discovery preview refresh failed",
			});
		}
	});

	// POST /api/sync — run 1Password discovery and sync clients into the database
	server.post("/api/sync", async (_request, reply) => {
		const masterToken = process.env.OP_SERVICE_ACCOUNT_TOKEN;
		if (!masterToken) {
			return reply.status(503).send({
				error: "OP_SERVICE_ACCOUNT_TOKEN not set",
				message:
					"Set OP_SERVICE_ACCOUNT_TOKEN in environment to enable 1Password discovery",
			});
		}

		try {
			const clients = await runDiscoveryAndSync();
			return reply.send({
				status: "ok",
				clients: clients.map((c) => ({
					id: c.id,
					name: c.name,
					slug: c.slug,
					isActive: c.isActive,
				})),
			});
		} catch (error) {
			_request.log.error(error, "Sync failed");
			return reply.status(500).send({
				error: error instanceof Error ? error.message : "Sync failed",
			});
		}
	});

	// POST /api/check — run provider checks for all active clients
	server.post("/api/check", async (_request, reply) => {
		try {
			const results = await runProviderChecks();
			const succeeded = results.filter((r) => r.status === "success").length;
			const failed = results.filter((r) => r.status === "error").length;
			return reply.send({
				status: "ok",
				results: results.map((r) => ({
					clientId: r.clientId,
					provider: r.provider,
					status: r.status,
					error: r.error,
				})),
				summary: { total: results.length, succeeded, failed },
			});
		} catch (error) {
			_request.log.error(error, "Check failed");
			return reply.status(500).send({
				error: error instanceof Error ? error.message : "Check failed",
			});
		}
	});

	// GET /api/clients/:id/usage — check history for a client
	server.get<{ Params: { id: string } }>(
		"/api/clients/:id/usage",
		async (request, reply) => {
			const { id } = request.params;

			// Verify the client exists
			const client = await clientRegistry.getClient(id);
			if (!client) {
				return reply.status(404).send({ error: "Client not found" });
			}

			const checks = await getCheckHistory(id);
			return reply.send({ clientId: id, checks });
		},
	);

	// POST /api/full-cycle — run the full discovery → check → notify cycle
	server.post("/api/full-cycle", async (_request, reply) => {
		try {
			const { results, clients } = await runFullCycle();
			const succeeded = results.filter((r) => r.status === "success").length;
			const failed = results.filter((r) => r.status === "error").length;
			return reply.send({
				status: "ok",
				results: results.map((r) => ({
					clientId: r.clientId,
					provider: r.provider,
					status: r.status,
					error: r.error,
				})),
				clients: clients.map((c) => ({
					id: c.id,
					name: c.name,
					slug: c.slug,
					isActive: c.isActive,
				})),
				summary: {
					total: results.length,
					succeeded,
					failed,
					clientCount: clients.length,
				},
			});
		} catch (error) {
			_request.log.error(error, "Full cycle failed");
			return reply.status(500).send({
				error: error instanceof Error ? error.message : "Full cycle failed",
			});
		}
	});
};
