import { describe, expect, it } from "vitest";
import { ClaudeProvider } from "../providers/claude.js";
import { OpenRouterProvider } from "../providers/openrouter.js";
import { createProvider } from "./provider-factory.js";

describe("createProvider", () => {
	it("creates a provider with just an API key", () => {
		const provider = createProvider("openrouter", "sk-test-key");
		expect(provider).toBeInstanceOf(OpenRouterProvider);
		expect(provider.name).toBe("openrouter");
	});

	it("creates a provider with API key and billing key", () => {
		const provider = createProvider(
			"claude",
			"sk-ant-api03-regular-key",
			"sk-ant-admin-billing-key",
		);
		expect(provider).toBeInstanceOf(ClaudeProvider);
		expect(provider.name).toBe("claude");
	});

	it("creates a provider with undefined billing key", () => {
		const provider = createProvider("openrouter", "sk-test-key", undefined);
		expect(provider).toBeInstanceOf(OpenRouterProvider);
		expect(provider.name).toBe("openrouter");
	});

	it("throws for unknown provider", () => {
		expect(() => createProvider("unknown-provider", "key")).toThrow(
			"Unknown provider type",
		);
	});
});
