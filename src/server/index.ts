import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { healthRoutes } from "./routes/health.js";
import { clientRoutes } from "./routes/clients.js";
import { startScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

	// Serve the built dashboard at root
	const dashboardDist = path.resolve(__dirname, "dashboard", "dist");
	await server.register(staticFiles, {
		root: dashboardDist,
		prefix: "/",
		decorateReply: true,
	});

	// SPA fallback: serve index.html for any unmatched request
	server.setNotFoundHandler((_request, reply) => {
		return reply.sendFile("index.html", dashboardDist);
	});

	// Start the cron scheduler for periodic full cycles
	startScheduler();

	return server;
}
