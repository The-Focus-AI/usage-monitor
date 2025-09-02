import "dotenv/config";

import { buildServer } from "./index.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
	const server = await buildServer();

	// Graceful shutdown
	const shutdown = async (signal: string) => {
		server.log.info(`Received ${signal}, shutting down...`);
		await server.close();
		process.exit(0);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	try {
		await server.listen({ port: PORT, host: HOST });
		server.log.info(`Server listening on http://${HOST}:${PORT}`);
	} catch (err) {
		server.log.error(err);
		process.exit(1);
	}
}

main();
