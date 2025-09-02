import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";

export async function buildServer() {
	const server = Fastify({
		logger: {
			level: process.env.LOG_LEVEL ?? "info",
		},
	});

	// Health check — the only route for now
	await server.register(healthRoutes);

	return server;
}
