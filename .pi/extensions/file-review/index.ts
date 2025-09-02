/**
 * File Review Extension
 *
 * Provides:
 * - /review [path] — Opens a TUI file browser for reviewing markdown/text files
 * - review_file tool — LLM-callable tool to read and return file contents
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { FileBrowser } from "./FileBrowser.js";

export default function fileReviewExtension(pi: ExtensionAPI) {
	// ── Tool: review_file ───────────────────────────────────────────────────

	const ReviewFileParams = Type.Object({
		path: Type.String({ description: "Path to the file to review" }),
		startLine: Type.Optional(
			Type.Number({ description: "Start line number (1-based)" }),
		),
		endLine: Type.Optional(
			Type.Number({ description: "End line number (1-based, inclusive)" }),
		),
	});

	pi.registerTool({
		name: "review_file",
		label: "Review File",
		description:
			"Read and display a file's contents for review. Use when the user asks to review, look at, or discuss a file's contents.",
		promptSnippet: "Read a file's contents for review/discussion",
		promptGuidelines: [
			"Use review_file when the user asks to review or look at a file's contents.",
		],
		parameters: ReviewFileParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const filePath = path.resolve(ctx.cwd, params.path);

			// Security: ensure file is within project
			const resolved = path.resolve(filePath);
			if (!resolved.startsWith(ctx.cwd)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: Cannot read files outside the project directory. Requested: ${params.path}`,
						},
					],
					details: { path: params.path, error: "outside_project" },
				};
			}

			// Check file exists
			if (!fs.existsSync(resolved)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: File not found: ${params.path}`,
						},
					],
					details: { path: params.path, error: "not_found" },
				};
			}

			// Check it's a file
			const stat = fs.statSync(resolved);
			if (!stat.isFile()) {
				return {
					content: [
						{
							type: "text",
							text: `Error: Not a file: ${params.path}`,
						},
					],
					details: { path: params.path, error: "not_a_file" },
				};
			}

			// Check size (max 1MB)
			if (stat.size > 1024 * 1024) {
				return {
					content: [
						{
							type: "text",
							text: `Error: File too large (${(stat.size / (1024 * 1024)).toFixed(1)} MB). Max: 1 MB`,
						},
					],
					details: { path: params.path, error: "too_large", size: stat.size },
				};
			}

			// Read file
			let content: string;
			try {
				content = fs.readFileSync(resolved, "utf-8");
			} catch {
				return {
					content: [
						{
							type: "text",
							text: `Error: Could not read file: ${params.path} (may be binary)`,
						},
					],
					details: { path: params.path, error: "read_error" },
				};
			}

			// Apply line range if specified
			const lines = content.split("\n");
			const totalLines = lines.length;

			let startLine = Math.max(1, params.startLine ?? 1);
			const endLine = Math.min(totalLines, params.endLine ?? totalLines);
			if (startLine > endLine) startLine = endLine;

			const selectedLines = lines.slice(startLine - 1, endLine);
			const selectedContent = selectedLines.join("\n");

			// Determine file type for display
			const ext = path.extname(filePath).toLowerCase().replace(".", "");
			const isMarkdown = ext === "md" || ext === "mdx";

			// Build result
			const header = `**${params.path}** (${totalLines} lines, ${formatSize(stat.size)})`;
			const rangeInfo =
				startLine > 1 || endLine < totalLines
					? `\nShowing lines ${startLine}-${endLine} of ${totalLines}\n`
					: "";

			const displayContent = isMarkdown
				? `${header}${rangeInfo}\n\n${selectedContent}`
				: `${header}${rangeInfo}\n\`\`\`${ext || "text"}\n${selectedContent}\n\`\`\``;

			return {
				content: [
					{
						type: "text",
						text: displayContent,
					},
				],
				details: {
					path: params.path,
					lines: totalLines,
					startLine,
					endLine,
					size: stat.size,
					ext,
					isMarkdown,
				},
			};
		},
	});

	// ── Command: /review ────────────────────────────────────────────────────

	pi.registerCommand("review", {
		description:
			"Browse and preview files (usage: /review [path]). Opens a file browser, optionally starting at the given path.",
		handler: async (args, ctx) => {
			const targetPath = args.trim()
				? path.resolve(ctx.cwd, args.trim())
				: ctx.cwd;

			// If target is a file, open the tool directly
			if (args.trim()) {
				const resolved = path.resolve(ctx.cwd, args.trim());
				try {
					const stat = fs.statSync(resolved);
					if (stat.isFile()) {
						pi.sendUserMessage(
							`Please review this file and summarize it: ${args.trim()}`,
							{
								deliverAs: "steer",
							},
						);
						return;
					}
				} catch {
					// Not a file or doesn't exist, proceed with browser
				}
			}

			// Open file browser overlay
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const browser = new FileBrowser(targetPath, theme, {
					onClose: () => done(),
				});
				return browser;
			});
		},
	});
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
