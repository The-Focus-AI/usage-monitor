import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../../db/index.js";

export const healthRoutes: FastifyPluginAsync = async (server) => {
	server.get("/api/health", async (_request, reply) => {
		try {
			await db.execute(sql`SELECT 1`);
			return reply.status(200).send({
				status: "ok",
				timestamp: new Date().toISOString(),
				database: "connected",
			});
		} catch (error) {
			return reply.status(503).send({
				status: "error",
				timestamp: new Date().toISOString(),
				database: error instanceof Error ? error.message : "connection failed",
			});
		}
	});
};
