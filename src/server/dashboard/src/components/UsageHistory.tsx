import type { UsageCheck } from "../api.js";

interface Props {
	checks: UsageCheck[];
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

	const sorted = [...checks].sort(
		(a, b) =>
			new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
	);

	return (
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
						<th className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] py-3 px-4 border-b border-[#1a1a1a]/20">
							Status
						</th>
					</tr>
				</thead>
				<tbody>
					{sorted.slice(0, 100).map((check) => (
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
								{check.balance ? `$${Number(check.balance).toFixed(2)}` : "—"}
							</td>
							<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-right font-mono text-sm text-[#1a1a1a] tabular-nums">
								{check.spend && Number(check.spend) > 0
									? `$${Number(check.spend).toFixed(2)}`
									: "—"}
							</td>
							<td className="py-3 px-4 border-b border-[#1a1a1a]/10 text-center">
								<span
									className={`inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] border ${
										check.status === "success"
											? "bg-[#0055aa]/10 text-[#0055aa] border-[#0055aa]/30"
											: "bg-[#d93025]/10 text-[#d93025] border-[#d93025]/30"
									}`}
								>
									{check.status}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
