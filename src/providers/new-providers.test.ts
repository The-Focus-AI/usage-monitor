import { describe, expect, it } from "vitest";
import { AmpcodeProvider } from "./ampcode.js";
import { FalProvider } from "./fal.js";
import { NousProvider } from "./nous.js";
import { OpenCodeProvider } from "./opencode.js";

// Test helper: creates a provider with a fake key
const config = { apiKey: "test-key", enabled: true };

describe("FalProvider", () => {
	const provider = new FalProvider(config);

	it("has correct name", () => {
		expect(provider.name).toBe("fal");
	});

	it("returns emoji status", () => {
		const usage = {
			provider: "fal",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 10,
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const emoji = provider.getStatusEmoji(usage);
		expect(["🟢", "🟡", "🔴"]).toContain(emoji);
	});

	it("returns quick status string", () => {
		const usage = {
			provider: "fal",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 12.34,
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const status = provider.getQuickStatus(usage);
		expect(status).toContain("fal.ai");
		expect(status).toContain("12.34");
	});

	it("returns notification format string", () => {
		const usage = {
			provider: "fal",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 5,
			usageDetails: {
				creditBalance: 5,
				currency: "USD",
				recentUsageRecords: 3,
				totalUsageRecords: 10,
				note: "test",
			},
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const formatted = provider["formatUsageForNotification"](usage);
		expect(formatted).toContain("fal.ai");
		expect(formatted).toContain("5.00");
	});
});

describe("AmpcodeProvider", () => {
	const provider = new AmpcodeProvider(config);

	it("has correct name", () => {
		expect(provider.name).toBe("ampcode");
	});

	it("returns emoji status", () => {
		const usage = {
			provider: "ampcode",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 10,
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const emoji = provider.getStatusEmoji(usage);
		expect(["🟢", "🟡", "🔴"]).toContain(emoji);
	});

	it("returns quick status with balance", () => {
		const usage = {
			provider: "ampcode",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 7.5,
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const status = provider.getQuickStatus(usage);
		expect(status).toContain("Ampcode");
		expect(status).toContain("7.50");
	});
});

describe("OpenCodeProvider", () => {
	const provider = new OpenCodeProvider(config);

	it("has correct name", () => {
		expect(provider.name).toBe("opencode");
	});

	it("returns emoji status", () => {
		const usage = {
			provider: "opencode",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 0,
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		expect(provider.getStatusEmoji(usage)).toBe("🟢");
	});

	it("returns quick status with models count", () => {
		const usage = {
			provider: "opencode",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 0,
			usageDetails: { totalModels: 34 },
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const status = provider.getQuickStatus(usage);
		expect(status).toContain("OpenCode");
		expect(status).toContain("34");
	});
});

describe("NousProvider", () => {
	const provider = new NousProvider(config);

	it("has correct name", () => {
		expect(provider.name).toBe("nous");
	});

	it("returns emoji status", () => {
		const usage = {
			provider: "nous",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 0,
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		expect(provider.getStatusEmoji(usage)).toBe("🟢");
	});

	it("returns quick status with model info", () => {
		const usage = {
			provider: "nous",
			totalTokens: 0,
			totalCost: 0,
			remainingBalance: 0,
			usageDetails: { models: "Hermes, Forge" },
			billingPeriod: { start: "", end: "" },
			lastUpdated: new Date().toISOString(),
		};
		const status = provider.getQuickStatus(usage);
		expect(status).toContain("Nous");
	});
});
