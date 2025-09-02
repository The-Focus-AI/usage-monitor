import { useState } from "react";
import type { ApiKey } from "../api.js";
import { deleteKey, retryKeyCheck, updateKey } from "../api.js";

interface Props {
	keys: ApiKey[];
	onKeyDeleted: () => void;
	onCheckRun: () => void;
}

const PROVIDER_SYMBOL: Record<string, string> = {
	openrouter: "$",
	openai: "◎",
	claude: "◉",
	google: "◈",
	mistral: "△",
	groq: "⚡",
	perplexity: "◉",
	grok: "◇",
	fal: "◊",
	ampcode: "□",
	opencode: "◐",
	nous: "○",
	deepseek: "●",
	replicate: "◆",
};

function formatLastCheck(lastCheckAt: string | null): string {
	if (!lastCheckAt) return "";
	const date = new Date(lastCheckAt);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	return date.toLocaleDateString();
}

type KeyHealth = "working" | "error" | "unchecked" | "inactive";

function getKeyHealth(key: ApiKey): KeyHealth {
	if (!key.isActive) return "inactive";
	if (key.lastCheckStatus === null) return "unchecked";
	return key.lastCheckStatus === "success" ? "working" : "error";
}

function getHealthLabel(health: KeyHealth): string {
	switch (health) {
		case "working":
			return "Working";
		case "error":
			return "Not Working";
		case "unchecked":
			return "Unchecked";
		case "inactive":
			return "Inactive";
	}
}

function getHealthColors(health: KeyHealth) {
	switch (health) {
		case "working":
			return {
				dot: "bg-[#0055aa]",
				badge:
					"bg-[#0055aa]/10 text-[#0055aa] border-[#0055aa]/30",
			};
		case "error":
			return {
				dot: "bg-[#d93025]",
				badge:
					"bg-[#d93025]/10 text-[#d93025] border-[#d93025]/30",
			};
		case "unchecked":
			return {
				dot: "bg-[#1a1a1a]/20",
				badge:
					"bg-[#1a1a1a]/5 text-[#1a1a1a]/40 border-[#1a1a1a]/20",
			};
		case "inactive":
			return {
				dot: "bg-[#1a1a1a]/10",
				badge:
					"bg-[#1a1a1a]/5 text-[#1a1a1a]/30 border-[#1a1a1a]/10",
			};
	}
}

const inputClass =
	"w-full px-3 py-2 bg-white border border-[#1a1a1a]/20 text-[#1a1a1a] text-sm font-normal outline-none focus:border-[#0055aa] focus:ring-2 focus:ring-[#0055aa]/20 placeholder:text-[#1a1a1a]/30 transition-all";

const labelClass =
	"block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#1a1a1a]/60 mb-1.5";

export function KeyList({ keys, onKeyDeleted, onCheckRun }: Props) {
	const [retrying, setRetrying] = useState<Set<string>>(new Set());
	const [retryError, setRetryError] = useState<string | null>(null);

	// Inline edit state
	const [editKey, setEditKey] = useState<string | null>(null);
	const [editKeyValue, setEditKeyValue] = useState("");
	const [editBillingValue, setEditBillingValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	if (keys.length === 0) {
		return (
			<div className="bg-[#f3f2ea] border border-[#1a1a1a] p-12 md:p-16 text-center">
				<p className="font-mono text-xs uppercase tracking-wider text-[#1a1a1a]/40 mb-4">
					No entries
				</p>
				<p className="text-base text-[#1a1a1a]/60 leading-relaxed">
					No API keys added yet. Add your first key above to begin monitoring.
				</p>
			</div>
		);
	}

	const handleDelete = async (id: string, label: string) => {
		if (!confirm(`Delete key "${label}"?`)) return;
		try {
			await deleteKey(id);
			onKeyDeleted();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Delete failed");
		}
	};

	const handleRetry = async (id: string) => {
		setRetrying((prev) => new Set(prev).add(id));
		setRetryError(null);
		try {
			await retryKeyCheck(id);
			onCheckRun();
		} catch (err) {
			setRetryError(
				err instanceof Error ? err.message : "Retry failed",
			);
		} finally {
			setRetrying((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	};

	const openEdit = (key: ApiKey) => {
		setEditKey(key.id);
		setEditKeyValue("");
		setEditBillingValue("__UNCHANGED__");
		setSaveError(null);
	};

	const closeEdit = () => {
		setEditKey(null);
		setEditKeyValue("");
		setEditBillingValue("");
		setSaveError(null);
	};

	const handleSave = async (key: ApiKey) => {
		if (!editKeyValue.trim() && editBillingValue === "__UNCHANGED__") return;

		setSaving(true);
		setSaveError(null);
		try {
			const payload: { keyValue?: string; billingKeyValue?: string } = {};
			if (editKeyValue.trim()) {
				payload.keyValue = editKeyValue.trim();
			}
			if (editBillingValue !== "__UNCHANGED__") {
				payload.billingKeyValue = editBillingValue.trim() || "";
			}

			await updateKey(key.id, payload);
			closeEdit();
			// Auto-retry after save
			await handleRetry(key.id);
		} catch (err) {
			setSaveError(
				err instanceof Error ? err.message : "Save failed",
			);
		} finally {
			setSaving(false);
		}
	};

	// Sort: error first, then unchecked, then working, then inactive
	const sorted = [...keys].sort((a, b) => {
		const order = { error: 0, unchecked: 1, working: 2, inactive: 3 };
		return order[getKeyHealth(a)] - order[getKeyHealth(b)];
	});

	const workingCount = sorted.filter(
		(k) => getKeyHealth(k) === "working",
	).length;
	const errorCount = sorted.filter(
		(k) => getKeyHealth(k) === "error",
	).length;
	const uncheckedCount = sorted.filter(
		(k) => getKeyHealth(k) === "unchecked",
	).length;

	return (
		<section>
			<h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#d93025] mb-6 pb-2 border-b border-[#1a1a1a]/20">
				<span className="mr-2">02</span>
				Your Keys
				<span className="ml-3 text-[#1a1a1a]/40 font-normal">
					({keys.length})
				</span>
			</h2>

			{/* Global error message */}
			{retryError && (
				<div className="mb-4 p-4 bg-[#d93025]/10 border border-[#d93025]/30 text-[#d93025] text-sm font-medium">
					{retryError}
				</div>
			)}

			<div className="grid grid-cols-1 gap-px bg-[#1a1a1a] border border-[#1a1a1a]">
				{sorted.map((key) => {
					const health = getKeyHealth(key);
					const colors = getHealthColors(health);
					const isRetrying = retrying.has(key.id);
					const isEditing = editKey === key.id;

					return (
						<div
							key={key.id}
							className={[
								"transition-colors",
								isEditing ? "bg-[#f3f2ea]" : "bg-white hover:bg-[#f8f8f6]",
							].join(" ")}
						>
							<div className="p-4 md:p-6">
								{/* --- Summary row (always visible) --- */}
								<div className="flex items-start gap-4 md:gap-6">
									{/* Health dot */}
									<div className="flex-shrink-0 pt-1">
										<div className={`w-3 h-3 ${colors.dot}`} />
									</div>

									{/* Main content */}
									<div className="flex-1 min-w-0">
										{/* Top row: label + badge */}
										<div className="flex items-center gap-3 mb-1">
											<span
												className={[
													"text-sm font-bold tracking-tight",
													health === "inactive"
														? "text-[#1a1a1a]/30"
														: "text-[#1a1a1a]",
												].join(" ")}
											>
												{key.label}
											</span>
											<span
												className={[
													"inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] border",
													colors.badge,
												].join(" ")}
											>
												{isRetrying
													? "Checking..."
													: getHealthLabel(health)}
											</span>
										</div>

										{/* Metadata row */}
										<div className="flex items-center gap-2 font-mono text-[11px] text-[#1a1a1a]/40 tracking-wide mb-2">
											<span className="font-mono text-sm text-[#0055aa]/60 w-6 text-center">
												{PROVIDER_SYMBOL[key.provider] ?? "◎"}
											</span>
											<span className="uppercase">{key.provider}</span>
											<span className="text-[#1a1a1a]/20">·</span>
											<span>{key.keyPreview}</span>
											<span className="text-[#1a1a1a]/20">·</span>
											<span>
												{key.source === "1password"
													? "1Password"
													: "Manual"}
											</span>
											{key.lastCheckAt && (
												<>
													<span className="text-[#1a1a1a]/20">·</span>
													<span>
														Checked {formatLastCheck(key.lastCheckAt)}
													</span>
												</>
											)}
										</div>

										{/* Error message */}
										{health === "error" &&
											key.lastCheckError &&
											!isEditing && (
												<div className="mt-2 mb-1 p-3 bg-[#d93025]/5 border-l-2 border-[#d93025]">
													<p className="font-mono text-[11px] text-[#d93025] leading-relaxed">
														{key.lastCheckError}
													</p>
												</div>
											)}
									</div>

									{/* Actions */}
									<div className="flex items-start gap-2 flex-shrink-0">
										{(health === "error" || health === "unchecked") && (
											<>
												{!isEditing && (
													<button
														onClick={() => openEdit(key)}
														className="px-3 py-1.5 border border-[#1a1a1a]/20 bg-transparent text-[#1a1a1a]/60 hover:bg-[#1a1a1a]/5 font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
													>
														Fix
													</button>
												)}
												<button
													onClick={() => handleRetry(key.id)}
													disabled={isRetrying}
													className="px-3 py-1.5 border border-[#0055aa]/30 bg-transparent text-[#0055aa] hover:bg-[#0055aa]/10 font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
												>
													{isRetrying ? "..." : "Retry"}
												</button>
											</>
										)}
										{health === "working" && (
											<button
												onClick={() => handleRetry(key.id)}
												disabled={isRetrying}
												className="px-3 py-1.5 border border-[#0055aa]/30 bg-transparent text-[#0055aa] hover:bg-[#0055aa]/10 font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
											>
												{isRetrying ? "..." : "Re-check"}
											</button>
										)}
										<button
											onClick={() => handleDelete(key.id, key.label)}
											className="px-3 py-1.5 border border-[#d93025]/30 bg-transparent text-[#d93025] hover:bg-[#d93025]/10 font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
										>
											Remove
										</button>
									</div>
								</div>

								{/* --- Inline edit form --- */}
								{isEditing && (
									<div className="mt-4 pt-4 border-t border-[#1a1a1a]/10">
										<p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#0055aa] mb-4">
											Update key credentials
										</p>

										<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
											<div>
												<label className={labelClass}>
													API Key
												</label>
												<input
													type="password"
													value={editKeyValue}
													onChange={(e) =>
														setEditKeyValue(e.target.value)
													}
													placeholder="Enter new API key"
													className={inputClass}
												/>
												<p className="mt-1 font-mono text-[10px] text-[#1a1a1a]/40">
													Leave blank to keep current value
												</p>
											</div>
											<div>
												<label className={labelClass}>
													Billing Key
												</label>
												<input
													type="password"
													value={editBillingValue}
													onChange={(e) =>
														setEditBillingValue(e.target.value)
													}
													placeholder="New billing/admin key"
													className={inputClass}
												/>
												<p className="mt-1 font-mono text-[10px] text-[#1a1a1a]/40">
													Leave blank to keep current value
												</p>
											</div>
										</div>

										{saveError && (
											<div className="mb-4 p-3 bg-[#d93025]/5 border-l-2 border-[#d93025]">
												<p className="font-mono text-[11px] text-[#d93025] leading-relaxed">
													{saveError}
												</p>
											</div>
										)}

										<div className="flex items-center gap-3">
											<button
												onClick={() => handleSave(key)}
												disabled={saving}
												className="bg-[#0055aa] text-white px-4 py-2 hover:bg-[#0055aa]/90 transition-colors font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-default"
											>
												{saving ? "Saving..." : "Save & Retry"}
											</button>
											<button
												onClick={closeEdit}
												disabled={saving}
												className="px-3 py-1.5 border border-[#1a1a1a]/20 bg-transparent text-[#1a1a1a]/60 hover:bg-[#1a1a1a]/5 font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
											>
												Cancel
											</button>
										</div>
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{/* Summary footer */}
			{keys.length > 1 && (
				<div className="mt-4 font-mono text-[11px] text-[#1a1a1a]/40 tracking-wide">
					{workingCount} working
					{errorCount > 0 && <> · {errorCount} with errors</>}
					{uncheckedCount > 0 && <> · {uncheckedCount} unchecked</>}
				</div>
			)}
		</section>
	);
}
