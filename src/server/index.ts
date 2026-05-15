import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
import { clientRoutes } from "./routes/clients.js";
import { startScheduler } from "./scheduler.js";

export async function buildServer() {
	const server = Fastify({
		logger: {
			level: process.env.LOG_LEVEL ?? "info",
		},
	});

	// Health check
	await server.register(healthRoutes);

	// Client registry API
	await server.register(clientRoutes);

	// Start the cron scheduler for periodic full cycles
	startScheduler();

	return server;
}
