import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerCheck } from "./api.js";

describe("dashboard API client", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not send a JSON content-type header for bodyless POST requests", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({ summary: { total: 0, succeeded: 0, failed: 0 } }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);

		await triggerCheck();

		const [, init] = fetchMock.mock.calls[0]!;
		expect(init).toMatchObject({ method: "POST" });
		expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
	});
});
