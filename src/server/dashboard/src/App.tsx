import { useEffect, useState } from "react";
import type { Client, DiscoveryPreviewClient, UsageCheck } from "./api.js";
import {
	fetchClients,
	fetchClientUsage,
	fetchDiscoveryPreview,
	refreshDiscoveryPreview,
	triggerFullCycle,
} from "./api.js";

function formatBalance(amount: string | null): string {
	if (amount === null) return "—";
	const n = Number(amount);
	if (n < 0) return "N/A";
	return `$${n.toFixed(2)}`;
}

function statusSummary(client: Client): string {
	if (client.lastCheckStatus === "error") return "❌ Error";
	if (client.lastCheckStatus === "success") return "✅ OK";
	return "—";
}

function ClientList({
	clients,
	discoveryClients,
	onSelect,
	loading,
}: {
	clients: Client[];
	discoveryClients: DiscoveryPreviewClient[];
	onSelect: (c: Client) => void;
	loading: boolean;
}) {
	const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
	const clientsBySlug = new Map(clients.map((client) => [client.slug, client]));
	const rows =
		discoveryClients.length > 0
			? discoveryClients
			: clients.map((client) => ({
					name: client.name,
					vaultName: client.vaultName,
					slug: client.slug,
					keys: [],
				}));

	return (
		<div className="grid grid-cols-1 gap-px bg-[#1a1a1a] border border-[#1a1a1a]">
			<div className="bg-[#f3f2ea] px-4 py-3 md:px-6 md:py-4 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] flex items-center gap-4 border-b border-[#1a1a1a]/20">
				<span className="flex-1">Client / Vault</span>
				<span className="w-24 text-right">Status</span>
				<span className="w-20 text-right hidden sm:block">Keys</span>
				<span className="w-40 text-right hidden md:block">Last Checked</span>
			</div>
			{rows.length === 0 && (
				<div className="bg-white p-12 text-center text-[#1a1a1a]/40 font-mono text-xs uppercase tracking-wider">
					{loading ? "Loading..." : "No clients found"}
				</div>
			)}
			{rows.map((discovered) => {
				const client = clientsBySlug.get(discovered.slug);
				const isExpanded = expandedSlug === discovered.slug;
				return (
					<div key={discovered.slug} className="bg-white">
						<button
							onClick={() =>
								setExpandedSlug(isExpanded ? null : discovered.slug)
							}
							className="p-4 md:p-6 hover:bg-[#f8f8f6] transition-colors text-left w-full cursor-pointer"
						>
							<div className="flex items-center gap-4">
								<div className="w-5 font-mono text-[#0055aa] text-sm">
									{isExpanded ? "−" : "+"}
								</div>
								<div
									className={`w-3 h-3 flex-shrink-0 ${
										client?.lastCheckStatus === "success"
											? "bg-[#0055aa]"
											: client?.lastCheckStatus === "error"
												? "bg-[#d93025]"
												: "bg-[#1a1a1a]/20"
									}`}
								/>
								<div className="flex-1 min-w-0">
									<div className="text-sm font-bold text-[#1a1a1a] tracking-tight">
										{discovered.name}
									</div>
									<div className="font-mono text-[11px] text-[#1a1a1a]/40 mt-0.5">
										vault: {discovered.vaultName} · slug: {discovered.slug}
									</div>
								</div>
								<div className="w-24 text-right">
									<span
										className={`inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] border ${
											client?.lastCheckStatus === "success"
												? "bg-[#0055aa]/10 text-[#0055aa] border-[#0055aa]/30"
												: client?.lastCheckStatus === "error"
													? "bg-[#d93025]/10 text-[#d93025] border-[#d93025]/30"
													: "bg-[#1a1a1a]/5 text-[#1a1a1a]/30 border-[#1a1a1a]/10"
										}`}
									>
										{client ? statusSummary(client) : "Not Synced"}
									</span>
								</div>
								<div className="w-20 text-right font-mono text-[11px] text-[#1a1a1a]/60 hidden sm:block">
									{discovered.keys.length}
								</div>
								<div className="w-40 text-right font-mono text-[11px] text-[#1a1a1a]/40 hidden md:block">
									{client?.lastCheckAt
										? new Date(client.lastCheckAt).toLocaleString()
										: "—"}
								</div>
							</div>
						</button>
						{isExpanded && (
							<div className="border-t border-[#1a1a1a]/10 bg-[#f8f8f6] px-4 py-5 md:px-12 md:py-6">
								<div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#d93025] mb-3">
									Keys pulled from {discovered.vaultName}
								</div>
								{discovered.keys.length === 0 ? (
									<p className="font-mono text-xs text-[#1a1a1a]/50 uppercase tracking-wider">
										No items visible in this vault.
									</p>
								) : (
									<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
										{discovered.keys.map((key) => (
											<div
												key={`${discovered.slug}-${key.itemName}`}
												className={`border p-3 flex items-center gap-3 ${
													key.monitored
														? "bg-white border-[#1a1a1a]/10"
														: "bg-[#1a1a1a]/5 border-[#1a1a1a]/5 opacity-45"
												}`}
											>
												<div
													className={`w-2 h-2 ${key.monitored ? "bg-[#0055aa]" : "bg-[#1a1a1a]/30"}`}
												/>
												<div className="flex-1 min-w-0">
													<div className="font-mono text-[11px] text-[#1a1a1a] font-bold truncate">
														{key.itemName}
													</div>
													<div className="font-mono text-[10px] text-[#1a1a1a]/45 uppercase tracking-wider">
														{key.monitored
															? `${key.provider} checker`
															: `${key.category} · not checked`}
													</div>
												</div>
											</div>
										))}
									</div>
								)}
								{client && (
									<button
										onClick={() => onSelect(client)}
										className="mt-5 bg-[#1a1a1a] text-white px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-[#1a1a1a]/85 cursor-pointer"
									>
										View Check History
									</button>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function ClientDetail({
	client,
	checks,
	onBack,
}: {
	client: Client;
	checks: UsageCheck[];
	onBack: () => void;
}) {
	const latestByProvider = new Map<string, UsageCheck>();
	for (const check of checks) {
		const existing = latestByProvider.get(check.provider);
		if (!existing || new Date(check.checkedAt) > new Date(existing.checkedAt)) {
			latestByProvider.set(check.provider, check);
		}
	}

	const latest = [...latestByProvider.values()].sort((a, b) =>
		a.provider.localeCompare(b.provider),
	);

	const sortedChecks = [...checks].sort(
		(a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
	);

	return (
		<div className="space-y-8">
			{/* Back button + client name */}
			<div className="flex items-center gap-4">
				<button
					onClick={onBack}
					className="font-mono text-[11px] uppercase tracking-wider text-[#0055aa] hover:text-[#0055aa]/80 cursor-pointer bg-transparent border border-[#0055aa]/30 px-3 py-1.5"
				>
					← Back
				</button>
				<h2 className="text-xl font-bold text-[#1a1a1a]">{client.name}</h2>
			</div>

			{/* Latest per-provider checks */}
			<div>
				<h3 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#d93025] mb-4 pb-2 border-b border-[#1a1a1a]/20">
					Latest per Provider
				</h3>
				<div className="grid grid-cols-1 gap-px bg-[#1a1a1a] border border-[#1a1a1a]">
					{latest.length === 0 && (
						<div className="bg-white p-8 text-center text-[#1a1a1a]/40 font-mono text-xs uppercase tracking-wider">
							No check results yet
						</div>
					)}
					{latest.map((check) => (
						<div
							key={check.id}
							className="bg-white p-4 md:p-5 hover:bg-[#f8f8f6] transition-colors"
						>
							<div className="flex items-center gap-4">
								<div
									className={`w-3 h-3 flex-shrink-0 ${
										check.status === "success" ? "bg-[#0055aa]" : "bg-[#d93025]"
									}`}
								/>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-3 mb-1">
										<span className="text-sm font-bold text-[#1a1a1a] uppercase tracking-tight">
											{check.provider}
										</span>
										<span
											className={`inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] border ${
												check.status === "success"
													? "bg-[#0055aa]/10 text-[#0055aa] border-[#0055aa]/30"
													: "bg-[#d93025]/10 text-[#d93025] border-[#d93025]/30"
											}`}
										>
											{check.status}
										</span>
									</div>
									{check.status === "success" ? (
										<div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-[#1a1a1a]/70 tracking-wide">
											<span>
												<span className="text-[#1a1a1a]/40">BALANCE:</span>{" "}
												{formatBalance(check.balance)}
											</span>
											{check.spend && Number(check.spend) > 0 && (
												<span>
													<span className="text-[#1a1a1a]/40">SPEND:</span> $
													{Number(check.spend).toFixed(2)}
												</span>
											)}
										</div>
									) : (
										<p className="text-sm text-[#d93025]">
											{check.errorMessage ?? "Unknown error"}
										</p>
									)}
								</div>
								<div className="text-right font-mono text-[11px] text-[#1a1a1a]/40">
									{new Date(check.checkedAt).toLocaleString()}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Check history table */}
			{sortedChecks.length > 0 && (
				<div>
					<h3 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#d93025] mb-4 pb-2 border-b border-[#1a1a1a]/20">
						Check History ({sortedChecks.length} total)
					</h3>
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
								{sortedChecks.slice(0, 50).map((check) => (
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
											{formatBalance(check.balance)}
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
				</div>
			)}
		</div>
	);
}

export function App() {
	const [clients, setClients] = useState<Client[]>([]);
	const [discoveryClients, setDiscoveryClients] = useState<
		DiscoveryPreviewClient[]
	>([]);
	const [selectedClient, setSelectedClient] = useState<Client | null>(null);
	const [usage, setUsage] = useState<UsageCheck[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState("");

	const loadClients = async () => {
		setLoading(true);
		setError(null);
		try {
			const [clientData, discoveryData] = await Promise.all([
				fetchClients(),
				fetchDiscoveryPreview(),
			]);
			setClients(clientData);
			setDiscoveryClients(discoveryData);
			setLastUpdated(new Date().toLocaleTimeString());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	};

	const loadUsage = async (client: Client) => {
		setLoading(true);
		setError(null);
		try {
			const data = await fetchClientUsage(client.id);
			setUsage(data);
			setSelectedClient(client);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load usage");
		} finally {
			setLoading(false);
		}
	};

	const runChecks = async () => {
		setLoading(true);
		setError(null);
		try {
			await triggerFullCycle();
			await loadClients();
			if (selectedClient) {
				await loadUsage(selectedClient);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Checks failed");
		} finally {
			setLoading(false);
		}
	};

	const refreshInventory = async () => {
		setLoading(true);
		setError(null);
		try {
			const refreshed = await refreshDiscoveryPreview();
			const clientData = await fetchClients();
			setDiscoveryClients(refreshed);
			setClients(clientData);
			setLastUpdated(new Date().toLocaleTimeString());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Refresh failed");
		} finally {
			setLoading(false);
		}
	};

	const goBack = async () => {
		setSelectedClient(null);
		setUsage([]);
		await loadClients();
	};

	useEffect(() => {
		loadClients();
	}, []);

	return (
		<div className="min-h-screen bg-[#e8e6df] font-sans text-[#1a1a1a]">
			<div className="max-w-[1408px] mx-auto px-4 md:px-8 py-12 md:py-16 lg:py-24">
				{/* Hero */}
				<header className="bg-[#f3f2ea] border border-[#1a1a1a] shadow-[10px_10px_0px_0px_rgba(0,0,0,0.1)] p-8 md:p-12 lg:p-16 mb-12 md:mb-16">
					<div className="font-mono text-xs space-y-1 mb-6 md:mb-8 text-[#1a1a1a]/60">
						<p className="font-bold text-[#1a1a1a]">PROJECT: Usage Monitor</p>
						<p>TYPE: Client Dashboard</p>
						<p>ORG: Focus.AI Labs</p>
						{lastUpdated && <p>LAST SYNC: {lastUpdated}</p>}
					</div>

					<h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-[#1a1a1a] leading-[0.85] tracking-tight mb-6 md:mb-8">
						USAGE
						<br />
						<span className="text-[#0055aa]">MONITOR</span>
					</h1>

					<p className="text-base md:text-lg font-normal max-w-2xl leading-snug border-l-4 border-[#d93025] pl-6 py-2 text-[#1a1a1a]/80">
						Track API usage, balances, and spend across all clients and
						providers.
					</p>
				</header>

				{/* Toolbar */}
				<div className="flex items-center gap-4 mb-8 border-b-2 border-[#1a1a1a] pb-4">
					<h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#1a1a1a]">
						{selectedClient ? selectedClient.name : "All Clients"}
					</h2>
					<div className="flex-1" />
					{!selectedClient && (
						<button
							onClick={refreshInventory}
							disabled={loading}
							className="bg-white text-[#1a1a1a] px-4 md:px-6 py-2 hover:bg-[#f8f8f6] transition-colors font-mono text-[10px] md:text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-default border border-[#1a1a1a]"
						>
							{loading ? "Refreshing..." : "Refresh 1Password"}
						</button>
					)}
					<button
						onClick={runChecks}
						disabled={loading}
						className="bg-[#0055aa] text-white px-4 md:px-6 py-2 hover:bg-[#0055aa]/90 transition-colors font-mono text-[10px] md:text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-default border border-[#0055aa]"
					>
						{loading ? "Running..." : "Run Checks"}
					</button>
				</div>

				{/* Error */}
				{error && (
					<div className="mb-8 p-6 bg-[#d93025]/10 border border-[#d93025] text-[#d93025] text-sm font-medium">
						{error}
					</div>
				)}

				{/* Content */}
				{selectedClient ? (
					<ClientDetail
						client={selectedClient}
						checks={usage}
						onBack={goBack}
					/>
				) : (
					<ClientList
						clients={clients}
						discoveryClients={discoveryClients}
						onSelect={loadUsage}
						loading={loading}
					/>
				)}
			</div>
		</div>
	);
}
