import { useEffect, useState } from "react";
import type { ApiKey, UsageCheck } from "./api.js";
import { fetchKeys, fetchUsage, triggerCheck } from "./api.js";
import { AddKeyForm } from "./components/AddKeyForm.js";
import { KeyList } from "./components/KeyList.js";
import { UsageHistory } from "./components/UsageHistory.js";

type Tab = "keys" | "usage";

export function App() {
	const [tab, setTab] = useState<Tab>("keys");
	const [keys, setKeys] = useState<ApiKey[]>([]);
	const [usage, setUsage] = useState<UsageCheck[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string>("");

	const loadData = async () => {
		setLoading(true);
		setError(null);
		try {
			const [keysData, usageData] = await Promise.all([
				fetchKeys(),
				fetchUsage(),
			]);
			setKeys(keysData);
			setUsage(usageData);
			setLastUpdated(new Date().toLocaleTimeString());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load data");
		} finally {
			setLoading(false);
		}
	};

	const runChecks = async () => {
		setLoading(true);
		setError(null);
		try {
			await triggerCheck();
			const [keysData, usageData] = await Promise.all([
				fetchKeys(),
				fetchUsage(),
			]);
			setKeys(keysData);
			setUsage(usageData);
			setLastUpdated(new Date().toLocaleTimeString());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to run checks");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	return (
		<div className="min-h-screen bg-[#e8e6df] font-sans text-[#1a1a1a]">
			<div className="max-w-[1408px] mx-auto px-4 md:px-8 py-12 md:py-16 lg:py-24">
				{/* Labs hero card with offset shadow */}
				<header className="bg-[#f3f2ea] border border-[#1a1a1a] shadow-[10px_10px_0px_0px_rgba(0,0,0,0.1)] p-8 md:p-12 lg:p-16 mb-12 md:mb-16">
					{/* Metadata block */}
					<div className="font-mono text-xs space-y-1 mb-6 md:mb-8 text-[#1a1a1a]/60">
						<p className="font-bold text-[#1a1a1a]">PROJECT: Usage Monitor</p>
						<p>TYPE: API Key Dashboard</p>
						<p>ORG: Focus.AI Labs</p>
						{lastUpdated && <p>LAST SYNC: {lastUpdated}</p>}
					</div>

					<h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-[#1a1a1a] leading-[0.85] tracking-tight mb-6 md:mb-8">
						USAGE<br />
						<span className="text-[#0055aa]">MONITOR</span>
					</h1>

					<p className="text-base md:text-lg font-normal max-w-2xl leading-snug border-l-4 border-[#d93025] pl-6 py-2 text-[#1a1a1a]/80">
						Track API key spend, credit balances, and rate limits across all providers in one place.
					</p>
				</header>

				{/* Labs tab navigation */}
				<div className="flex border-b-2 border-[#1a1a1a] mb-8">
					{(["keys", "usage"] as Tab[]).map((t) => (
						<button
							key={t}
							onClick={() => setTab(t)}
							className={[
								"px-4 md:px-6 py-2 border-t border-x border-[#1a1a1a] font-mono text-[10px] md:text-xs font-bold uppercase tracking-wider cursor-pointer relative top-[2px] transition-colors",
								tab === t
									? "bg-[#f3f2ea] text-[#1a1a1a] border-b-[#f3f2ea] z-10"
									: "bg-[#d6d4ce] text-[#1a1a1a]/60 hover:bg-white",
							].join(" ")}
						>
							{t === "keys" ? "API Keys" : "Usage History"}
						</button>
					))}
					<button
						onClick={runChecks}
						disabled={loading}
						className="ml-auto bg-[#0055aa] text-white px-4 md:px-6 py-2 hover:bg-[#0055aa]/90 transition-colors font-mono text-[10px] md:text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-default border border-[#0055aa]"
					>
						{loading ? "Running..." : "Run Checks"}
					</button>
				</div>

				{/* Status messages with rhythm */}
				{error && (
					<div className="mb-8 p-6 bg-[#d93025]/10 border border-[#d93025] text-[#d93025] text-sm font-medium">
						{error}
					</div>
				)}

				{loading && (
					<div className="mb-8 p-6 bg-[#1a1a1a]/5 border border-[#1a1a1a]/20 text-[#1a1a1a]/60 font-mono text-xs uppercase tracking-wider">
						Processing checks...
					</div>
					)}

				{/* Content */}
				{!error && (
					<div className="space-y-8">
						{tab === "keys" && (
							<>
								<section className="bg-[#f3f2ea] border border-[#1a1a1a] p-6 md:p-8">
									<AddKeyForm onKeyAdded={loadData} />
								</section>
								<KeyList keys={keys} onKeyDeleted={loadData} onCheckRun={loadData} />
							</>
						)}
						{tab === "usage" && <UsageHistory checks={usage} />}
					</div>
				)}
			</div>
		</div>
	);
}
