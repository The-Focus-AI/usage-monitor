import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// DB-backed slice tests share the same Neon database. Run files
		// serially to avoid cross-file sync/deactivation races.
		fileParallelism: false,
		include: [
			"src/**/*.test.ts",
			"src/**/*.spec.ts",
			".pi/extensions/**/*.test.ts",
		],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
		},
	},
});
