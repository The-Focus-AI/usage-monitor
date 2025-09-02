import { useState } from "react";
import { addKey } from "../api.js";

const PROVIDERS = [
	"openrouter",
	"openai",
	"claude",
	"google",
	"mistral",
	"groq",
	"perplexity",
	"grok",
	"fal",
	"ampcode",
	"opencode",
	"nous",
	"deepseek",
	"replicate",
] as const;

const BILLING_HINTS: Record<
	string,
	{ title: string; body: string; link?: { text: string; url: string } }
> = {
	openai: {
		title: "Add a billing key for cost data",
		body: "Regular API keys show model access only. To see monthly spend, add an organization admin key as the Billing Key.",
		link: {
			text: "platform.openai.com/settings/organization/admin-keys",
			url: "https://platform.openai.com/settings/organization/admin-keys",
		},
	},
	claude: {
		title: "Add an admin key for live spend",
		body: "Standard API keys show only available models. Add an admin key as the Billing Key to unlock real-time cost reports and per-model token counts.",
		link: {
			text: "console.anthropic.com/settings/admin-keys",
			url: "https://console.anthropic.com/settings/admin-keys",
		},
	},
	google: {
		title: "Connect billing for spend data",
		body: "AI Studio API keys show model availability only. For billing accounts and cost data, connect Google Cloud Billing via OAuth or add an access token.",
		link: {
			text: "console.cloud.google.com/billing",
			url: "https://console.cloud.google.com/billing",
		},
	},
};

interface Props {
	onKeyAdded: () => void;
}

export function AddKeyForm({ onKeyAdded }: Props) {
	const [provider, setProvider] = useState<string>(PROVIDERS[0]);
	const [label, setLabel] = useState("");
	const [keyValue, setKeyValue] = useState("");
	const [billingKeyValue, setBillingKeyValue] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const hint = BILLING_HINTS[provider];
	const showHint = hint && !billingKeyValue.trim();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!label.trim() || !keyValue.trim()) return;

		setSubmitting(true);
		setError(null);
		try {
			await addKey(
				provider,
				label.trim(),
				keyValue.trim(),
				billingKeyValue.trim() || undefined,
			);
			setLabel("");
			setKeyValue("");
			setBillingKeyValue("");
			onKeyAdded();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add key");
		} finally {
			setSubmitting(false);
		}
	};

	const inputClass =
		"w-full px-4 py-3 bg-white border border-[#1a1a1a]/20 text-[#1a1a1a] text-sm font-normal outline-none focus:border-[#0055aa] focus:ring-2 focus:ring-[#0055aa]/20 placeholder:text-[#1a1a1a]/30 transition-all";

	const labelClass =
		"block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#1a1a1a]/60 mb-2";

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div>
				<h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#d93025] mb-6 pb-2 border-b border-[#1a1a1a]/20">
					<span className="mr-2">01</span>
					Add API Key
				</h2>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<div>
					<label className={labelClass}>Provider</label>
					<select
						value={provider}
						onChange={(e) => setProvider(e.target.value)}
						className={inputClass}
					>
						{PROVIDERS.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className={labelClass}>Label</label>
					<input
						type="text"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="Production key"
						className={inputClass}
					/>
				</div>
				<div>
					<label className={labelClass}>API Key</label>
					<input
						type="password"
						value={keyValue}
						onChange={(e) => setKeyValue(e.target.value)}
						placeholder="sk-..."
						className={inputClass}
					/>
				</div>
				<div>
					<label className={labelClass}>Billing Key (optional)</label>
					<input
						type="password"
						value={billingKeyValue}
						onChange={(e) => setBillingKeyValue(e.target.value)}
						placeholder="Admin / org key"
						className={inputClass}
					/>
				</div>
			</div>

			<div className="flex items-start gap-4">
				<button
					type="submit"
					disabled={submitting}
					className="bg-[#0055aa] text-white px-6 py-3 hover:bg-[#0055aa]/90 transition-colors font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-default border border-[#0055aa]"
				>
					{submitting ? "Adding..." : "Add Key"}
				</button>
			</div>

			{showHint && (
				<div className="p-6 bg-white border-l-4 border-l-[#0055aa] border border-[#1a1a1a]/20">
					<p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] mb-2">
						{hint.title}
					</p>
					<p className="text-sm text-[#1a1a1a]/70 leading-relaxed mb-3">
						{hint.body}
					</p>
					{hint.link && (
						<a
							href={hint.link.url}
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#0055aa] hover:underline decoration-2 underline-offset-4"
						>
							{hint.link.text} ↗
						</a>
					)}
				</div>
			)}

			{error && (
				<div className="p-4 bg-[#d93025]/10 border border-[#d93025]/30 text-[#d93025] text-sm font-medium">
					{error}
				</div>
			)}
		</form>
	);
}
