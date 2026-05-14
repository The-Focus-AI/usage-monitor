import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../../db/index.js";
import { clients, usageChecks } from "../../db/schema.js";
import { clientRegistry } from "../client-registry.js";

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
};
