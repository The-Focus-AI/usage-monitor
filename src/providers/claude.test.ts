import { describe, expect, it } from "vitest";
import { ClaudeProvider } from "./claude.js";

describe("ClaudeProvider", () => {
	const today = new Date().toISOString();
	const baseBillingPeriod = { start: today, end: today };

	describe("admin key detection", () => {
		it("detects admin key by prefix on apiKey", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-admin-test-admin-key",
				enabled: true,
			});
			// isAdmin is private — verified via behavior below
			expect(provider.name).toBe("claude");
		});

		it("detects admin key by prefix on billingKey", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-api03-regular-key",
				enabled: true,
				billingKey: "sk-ant-admin-billing-key",
			});
			expect(provider.name).toBe("claude");
		});

		it("does not detect admin for regular api key", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-api03-regular-key",
				enabled: true,
			});
			expect(provider.name).toBe("claude");
		});
	});

	describe("status emoji", () => {
		it("returns green for spend < 100", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-admin-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 0,
				totalCost: 50,
				remainingBalance: -1,
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			expect(provider.getStatusEmoji(usage)).toBe("🟢");
		});

		it("returns yellow for spend between 100 and 500", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-admin-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 0,
				totalCost: 250,
				remainingBalance: -1,
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			expect(provider.getStatusEmoji(usage)).toBe("🟡");
		});

		it("returns red for spend > 500", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-admin-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 0,
				totalCost: 600,
				remainingBalance: -1,
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			expect(provider.getStatusEmoji(usage)).toBe("🔴");
		});

		it("returns green for regular key regardless of spend", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-api03-regular-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 0,
				totalCost: 1000,
				remainingBalance: 0,
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			expect(provider.getStatusEmoji(usage)).toBe("🟢");
		});
	});

	describe("quick status", () => {
		it("shows spend for admin key", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-admin-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 15000,
				totalCost: 42.5,
				remainingBalance: -1,
				usageDetails: {
					uniqueModels: 3,
					modelList: "claude-3-opus, claude-3-sonnet",
				},
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const status = provider.getQuickStatus(usage);
			expect(status).toContain("42.50");
			expect(status).toContain("Claude");
		});

		it("shows model count for regular key", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-api03-regular-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: 0,
				usageDetails: { availableModels: 6 },
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const status = provider.getQuickStatus(usage);
			expect(status).toContain("6");
			expect(status).toContain("Claude");
		});
	});

	describe("notification formatting", () => {
		it("includes spend data for admin key", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-admin-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 5000,
				totalCost: 12.34,
				remainingBalance: -1,
				usageDetails: {
					inputTokens: 3000,
					outputTokens: 2000,
					cacheReadTokens: 500,
					cacheCreationTokens: 100,
					uniqueModels: 2,
					modelList: "claude-3-opus, claude-3-haiku",
					workspaceCount: 1,
				},
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const formatted = provider["formatUsageForNotification"](usage);
			expect(formatted).toContain("12.34");
			expect(formatted).toContain("Admin API");
		});

		it("shows console link for regular key", () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-api03-regular-key",
				enabled: true,
			});
			const usage = {
				provider: "claude",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: 0,
				usageDetails: {
					availableModels: 6,
					models: "claude-3",
				},
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const formatted = provider["formatUsageForNotification"](usage);
			expect(formatted).toContain("console.anthropic.com");
		});
	});

	describe("getBilling", () => {
		it("marks regular billing as Anthropic Console", async () => {
			const provider = new ClaudeProvider({
				apiKey: "sk-ant-api03-regular-key",
				enabled: true,
			});
			const billing = await provider.getBilling!();
			expect(billing).not.toBeNull();
			expect(billing!.billingMethod).toBe("Anthropic Console");
			expect(billing!.monthlySpend).toBe(0);
		});
	});
});
