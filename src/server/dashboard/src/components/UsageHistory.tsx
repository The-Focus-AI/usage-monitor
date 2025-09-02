import type { UsageCheck } from "../api.js";

interface Props {
	checks: UsageCheck[];
}

function formatBalance(amount: string | null): string {
	if (amount === null) return "";
	const n = Number(amount);
	if (n < -1) return "Admin key required";
	if (n < 0) return "N/A (no billing API)";
	return `$${n.toFixed(2)}`;
}

export function UsageHistory({ checks }: Props) {
	if (checks.length === 0) {
		return (
			<div className="bg-[#f3f2ea] border border-[#1a1a1a] p-12 md:p-16 text-center">
				<p className="font-mono text-xs uppercase tracking-wider text-[#1a1a1a]/40 mb-4">
					No data
				</p>
				<p className="text-base text-[#1a1a1a]/60 leading-relaxed">
					No usage data yet. Click "Run Checks" to check all providers.
				</p>
			</div>
		);
	}

	// Group by key, show latest check per key
	const latestByKey = new Map<string, UsageCheck>();
	for (const check of checks) {
		const existing = latestByKey.get(check.keyId);
		if (
			!existing ||
			new Date(check.checkedAt) > new Date(existing.checkedAt)
		) {
			latestByKey.set(check.keyId, check);
		}
	}

	const latest = [...latestByKey.values()].sort(
		(a, b) =>
			new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
	);

	// All checks grouped by key for detailed view
	const checksByKey = new Map<string, UsageCheck[]>();
	for (const check of checks) {
		const group = checksByKey.get(check.keyId) ?? [];
		group.push(check);
		checksByKey.set(check.keyId, group);
	}

	return (
		<section className="space-y-8">
			{/* Latest status summary */}
			<div>
				<h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#d93025] mb-6 pb-2 border-b border-[#1a1a1a]/20">
					<span className="mr-2">01</span>
					Latest Checks
					<span className="ml-3 text-[#1a1a1a]/40 font-normal">
						({latest.length} keys)
					</span>
				</h2>

				<div className="grid grid-cols-1 gap-px bg-[#1a1a1a] border border-[#1a1a1a]">
					{latest.map((check) => (
						<div
							key={check.id}
							className="bg-white p-4 md:p-6 hover:bg-[#f8f8f6] transition-colors"
						>
							<div className="flex items-center gap-4">
								<div className="flex-shrink-0">
									<div
										className="w-3 h-3"
										style={{
											backgroundColor:
												check.status === "success"
													? "#0055aa"
													: "#d93025",
										}}
									/>
								</div>

								<div className="flex-1 min-w-0">
									<div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-2">
										<span className="text-sm font-bold text-[#1a1a1a] tracking-tight uppercase">
											{check.provider}
										</span>
										<span className="font-mono text-[11px] text-[#1a1a1a]/40 tracking-wide">
											{new Date(check.checkedAt).toLocaleString()}
										</span>
										<span
											className={[
												"inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] border",
												check.status === "success"
													? "bg-[#0055aa]/10 text-[#0055aa] border-[#0055aa]/30"
													: "bg-[#d93025]/10 text-[#d93025] border-[#d93025]/30",
											].join(" ")}
										>
											{check.status}
										</span>
									</div>

									{check.status === "success" ? (
										<div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px] text-[#1a1a1a]/70 tracking-wide">
											{check.creditBalance !== null && (
												<span>
													<span className="text-[#1a1a1a]/40">BALANCE:</span>{" "}
													{formatBalance(check.creditBalance)}
												</span>
											)}
											{check.spendAmount !== null &&
												Number(check.spendAmount) > 0 && (
												<span>
													<span className="text-[#1a1a1a]/40">SPEND:</span>{" "}
													${Number(check.spendAmount).toFixed(2)}
												</span>
											)}
											{check.limitRemaining !== null &&
												Number(check.limitRemaining) > 0 && (
												<span>
													<span className="text-[#1a1a1a]/40">LIMIT:</span>{" "}
													${Number(check.limitRemaining).toFixed(2)}
												</span>
											)}
											{check.creditBalance === null &&
												check.spendAmount === null && (
												<span className="text-[#1a1a1a]/40">
													No balance data available
												</span>
											)}
										</div>
									) : (
										<p className="text-sm text-[#d93025]">
											{check.errorMessage ?? "Unknown error"}
										</p>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Historical data */}
			<div>
				<h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#d93025] mb-6 pb-2 border-b border-[#1a1a1a]/20">
					<span className="mr-2">02</span>
					Check History
					<span className="ml-3 text-[#1a1a1a]/40 font-normal">
						({checks.length} total)
					</span>
				</h2>

				<div className="overflow-x-auto">
					<table className="w-full text-sm border-collapse">
						<thead>
							<tr className="bg-[#1a1a1a]/5">
								<th className="text-left font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
									Provider
								</th>
								<th className="text-left font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
									Time
								</th>
								<th className="text-right font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
									Balance
								</th>
								<th className="text-right font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
									Spend
								</th>
								<th className="text-right font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
									Limit
								</th>
								<th className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
									Status
								</th>
							</tr>
						</thead>
						<tbody>
							{[...checks]
								.sort(
									(a, b) =>
										new Date(b.checkedAt).getTime() -
										new Date(a.checkedAt).getTime(),
								)
								.map((check) => (
									<tr
										key={check.id}
										className="hover:bg-[#1a1a1a]/[0.02] transition-colors"
									>
										<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-[#1a1a1a] font-medium uppercase">
											{check.provider}
										</td>
										<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-[#1a1a1a]/40 font-mono text-[11px]">
											{new Date(check.checkedAt).toLocaleString()}
										</td>
										<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-right font-mono text-sm text-[#1a1a1a] tabular-nums">
											{check.creditBalance !== null
												? formatBalance(check.creditBalance)
												: "—"}
										</td>
										<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-right font-mono text-sm text-[#1a1a1a] tabular-nums">
											{check.spendAmount !== null &&
											Number(check.spendAmount) > 0
												? `$${Number(check.spendAmount).toFixed(2)}`
												: "—"}
										</td>
										<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-right font-mono text-sm text-[#1a1a1a] tabular-nums">
											{check.limitRemaining !== null &&
											Number(check.limitRemaining) > 0
												? `$${Number(check.limitRemaining).toFixed(2)}`
												: "—"}
										</td>
										<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-center">
											<span
												className={[
													"inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] border",
													check.status === "success"
														? "bg-[#0055aa]/10 text-[#0055aa] border-[#0055aa]/30"
														: "bg-[#d93025]/10 text-[#d93025] border-[#d93025]/30",
												].join(" ")}
											>
												{check.status}
											</span>
										</td>
									</tr>
									))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
