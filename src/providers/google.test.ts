import { describe, expect, it } from "vitest";
import { GoogleAIStudioProvider } from "./google.js";

describe("GoogleAIStudioProvider", () => {
	const today = new Date().toISOString();
	const baseBillingPeriod = { start: today, end: today };

	describe("billing access detection", () => {
		it("detects billing key presence", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
				billingKey: "ya29.oauth-token",
			});
			expect(provider.name).toBe("google");
		});

		it("works without billing key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
			});
			expect(provider.name).toBe("google");
		});
	});

	describe("status emoji", () => {
		it("returns green for AI Studio key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
			});
			const usage = {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			expect(provider.getStatusEmoji(usage)).toBe("🟢");
		});

		it("returns green for billing key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
				billingKey: "ya29.oauth-token",
			});
			const usage = {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			expect(provider.getStatusEmoji(usage)).toBe("🟢");
		});
	});

	describe("quick status", () => {
		it("shows billing account count for billing key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
				billingKey: "ya29.oauth-token",
			});
			const usage = {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: {
					billingAccounts: 3,
					totalMonthlyBudget: 500,
				},
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const status = provider.getQuickStatus(usage);
			expect(status).toContain("Google Cloud");
			expect(status).toContain("3");
		});

		it("shows models for AI Studio key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
			});
			const usage = {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: { availableModels: 8 },
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const status = provider.getQuickStatus(usage);
			expect(status).toContain("Google AI Studio");
			expect(status).toContain("8");
		});
	});

	describe("notification formatting", () => {
		it("includes Cloud Billing info for billing key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
				billingKey: "ya29.oauth-token",
			});
			const usage = {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: {
					billingAccounts: 2,
					billingAccountNames: "My Billing, Project Billing",
					totalMonthlyBudget: 1000,
					budgetSummary: "2 account(s), $1000.00 in budgets",
					note: "Cloud Billing connected",
				},
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const formatted = provider["formatUsageForNotification"](usage);
			expect(formatted).toContain("Google Cloud");
			expect(formatted).toContain("Billing Accounts: 2");
			expect(formatted).toContain("$1000.00");
		});

		it("shows AI Studio info for regular key", () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
			});
			const usage = {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: {
					availableModels: 6,
					modelNames: "Gemini Pro, Gemini Flash",
					note: "test note",
				},
				billingPeriod: baseBillingPeriod,
				lastUpdated: today,
			};
			const formatted = provider["formatUsageForNotification"](usage);
			expect(formatted).toContain("Google AI Studio");
		});
	});

	describe("getBilling", () => {
		it("returns AI Studio billing for regular key", async () => {
			const provider = new GoogleAIStudioProvider({
				apiKey: "test-key",
				enabled: true,
			});
			const billing = await provider.getBilling!();
			expect(billing).not.toBeNull();
			expect(billing!.billingMethod).toBe("Google Cloud Billing");
			expect(billing!.monthlySpend).toBe(0);
		});
	});
});
