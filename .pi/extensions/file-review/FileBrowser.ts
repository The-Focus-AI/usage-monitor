/**
 * FileBrowser - A two-pane TUI component for browsing and previewing files.
 *
 * Left pane: scrollable file list with search/filter
 * Right pane: scrollable content preview with syntax highlighting
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FileEntry {
	/** Relative path from root */
	relativePath: string;
	/** Absolute path */
	absolutePath: string;
	/** File size in bytes */
	size: number;
	/** Last modified timestamp */
	modifiedAt: Date;
	/** File extension (lowercase, no dot) */
	ext: string;
	/** Display name (filename only) */
	name: string;
	/** Directory containing this file (relative to root) */
	dir: string;
}

/** Text file extensions we can preview */
const TEXT_EXTENSIONS = new Set([
	"md",
	"mdx",
	"txt",
	"json",
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"yaml",
	"yml",
	"toml",
	"ini",
	"cfg",
	"conf",
	"env",
	"css",
	"scss",
	"less",
	"html",
	"htm",
	"xml",
	"svg",
	"sh",
	"bash",
	"zsh",
	"fish",
	"py",
	"rb",
	"rs",
	"go",
	"java",
	"c",
	"cpp",
	"h",
	"hpp",
	"sql",
	"graphql",
	"gql",
	"vue",
	"svelte",
	"astro",
	"prisma",
	"proto",
	"lock",
	"gitignore",
	"dockerignore",
	"Dockerfile",
	"Makefile",
]);

/** Directories to skip when scanning */
const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".nuxt",
	"__pycache__",
	".venv",
	"venv",
	"coverage",
	".cache",
	".turbo",
	".parcel-cache",
]);

/** Max file size to preview (1MB) */
const MAX_FILE_SIZE = 1024 * 1024;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
	const now = new Date();
	const isToday =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	if (isToday) {
		return date.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	}
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function isTextFile(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase().replace(".", "");
	const basename = path.basename(filePath);
	const nameWithoutDot = basename.startsWith(".")
		? basename.slice(1)
		: basename;
	return (
		TEXT_EXTENSIONS.has(ext) ||
		TEXT_EXTENSIONS.has(basename) ||
		TEXT_EXTENSIONS.has(nameWithoutDot)
	);
}

/** Check if an extension is a markdown variant */
function isMarkdown(ext: string): boolean {
	return ext === "md" || ext === "mdx";
}

// ─── File Scanner ────────────────────────────────────────────────────────────

export function scanFiles(rootDir: string): FileEntry[] {
	const results: FileEntry[] = [];

	function walk(dir: string) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
					walk(fullPath);
				}
			} else if (entry.isFile()) {
				if (!isTextFile(fullPath)) continue;

				let stat: fs.Stats;
				try {
					stat = fs.statSync(fullPath);
				} catch {
					continue;
				}

				if (stat.size > MAX_FILE_SIZE) continue;

				const ext = path.extname(entry.name).toLowerCase().replace(".", "");
				results.push({
					relativePath: path.relative(rootDir, fullPath),
					absolutePath: fullPath,
					size: stat.size,
					modifiedAt: stat.mtime,
					ext,
					name: entry.name,
					dir: path.relative(rootDir, dir),
				});
			}
		}
	}

	walk(rootDir);

	// Sort: directories first (by path), then by name
	results.sort((a, b) => {
		const aDir = a.dir + "/" + a.name;
		const bDir = b.dir + "/" + b.name;
		return aDir.localeCompare(bDir);
	});

	return results;
}

function readFileContent(filePath: string): string | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		// Limit preview to 500 lines
		const lines = content.split("\n");
		if (lines.length > 500) {
			return lines.slice(0, 500).join("\n") + "\n\n... (truncated)";
		}
		return content;
	} catch {
		return null;
	}
}

// ─── FileBrowser Component ───────────────────────────────────────────────────

export interface FileBrowserCallbacks {
	onClose: () => void;
}

export class FileBrowser implements Component {
	private files: FileEntry[];
	private filteredFiles: FileEntry[];
	private selectedIndex: number;
	private previewContent: string | null;
	private previewFile: FileEntry | null;
	private previewScrollOffset: number;
	private searchQuery: string;
	private isSearching: boolean;
	private focusPane: "files" | "preview";
	private fileListScrollOffset: number;
	private callbacks: FileBrowserCallbacks;
	private theme: Theme;

	// Cache
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(rootDir: string, theme: Theme, callbacks: FileBrowserCallbacks) {
		this.theme = theme;
		this.callbacks = callbacks;
		this.files = scanFiles(rootDir);
		this.filteredFiles = [...this.files];
		this.selectedIndex = 0;
		this.previewContent = null;
		this.previewFile = null;
		this.previewScrollOffset = 0;
		this.searchQuery = "";
		this.isSearching = false;
		this.focusPane = "files";
		this.fileListScrollOffset = 0;
	}

	// ─── Input Handling ─────────────────────────────────────────────────────

	handleInput(data: string): void {
		if (this.isSearching) {
			this.handleSearchInput(data);
			return;
		}

		// Global keys
		if (matchesKey(data, Key.escape)) {
			this.callbacks.onClose();
			return;
		}

		if (matchesKey(data, Key.slash)) {
			this.isSearching = true;
			this.searchQuery = "";
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
			this.focusPane = this.focusPane === "files" ? "preview" : "files";
			this.invalidate();
			return;
		}

		// Pane-specific keys
		if (this.focusPane === "files") {
			this.handleFileListInput(data);
		} else {
			this.handlePreviewInput(data);
		}
	}

	private handleSearchInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.isSearching = false;
			this.searchQuery = "";
			this.applyFilter();
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			this.isSearching = false;
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.backspace)) {
			this.searchQuery = this.searchQuery.slice(0, -1);
			this.applyFilter();
			this.invalidate();
			return;
		}

		// Printable characters
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.searchQuery += data;
			this.applyFilter();
			this.invalidate();
		}
	}

	private handleFileListInput(data: string): void {
		if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
			if (this.selectedIndex < this.filteredFiles.length - 1) {
				this.selectedIndex++;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.enter)) {
			this.openSelectedFile();
			return;
		}
	}

	private handlePreviewInput(data: string): void {
		if (
			(matchesKey(data, Key.up) || matchesKey(data, "k")) &&
			this.selectedIndex > 0
		) {
			this.selectedIndex--;
			this.openSelectedFile();
			return;
		}

		if (
			(matchesKey(data, Key.down) || matchesKey(data, "j")) &&
			this.selectedIndex < this.filteredFiles.length - 1
		) {
			this.selectedIndex++;
			this.openSelectedFile();
			return;
		}

		// Scroll within preview
		if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
			this.previewScrollOffset = Math.max(0, this.previewScrollOffset - 20);
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f"))) {
			this.previewScrollOffset += 20;
			this.invalidate();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			this.focusPane = "files";
			this.invalidate();
			return;
		}
	}

	// ─── Actions ────────────────────────────────────────────────────────────

	private applyFilter(): void {
		const q = this.searchQuery.toLowerCase();
		if (!q) {
			this.filteredFiles = [...this.files];
		} else {
			this.filteredFiles = this.files.filter((f) =>
				f.relativePath.toLowerCase().includes(q),
			);
		}
		this.selectedIndex = 0;
		this.fileListScrollOffset = 0;
	}

	private openSelectedFile(): void {
		const file = this.filteredFiles[this.selectedIndex];
		if (!file) return;

		const content = readFileContent(file.absolutePath);
		this.previewFile = file;
		this.previewContent = content;
		this.previewScrollOffset = 0;
		this.invalidate();
	}

	// ─── Rendering ──────────────────────────────────────────────────────────

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const theme = this.theme;
		const listWidth = Math.max(20, Math.min(40, Math.floor(width * 0.3)));
		const previewWidth = width - listWidth - 1; // -1 for separator

		// ── Header ──
		lines.push(this.renderHeader(width));

		// ── Search bar (if active) ──
		if (this.isSearching) {
			lines.push(this.renderSearchBar(width));
		}

		// ── Content row ──
		const listLines = this.renderFileList(listWidth);
		const previewLines = this.renderPreview(previewWidth);

		const maxRows = Math.max(listLines.length, previewLines.length);
		for (let i = 0; i < maxRows; i++) {
			const left = listLines[i] ?? "";
			const right = i < previewLines.length ? (previewLines[i] ?? "") : "";

			// Pad left to full width with spaces
			const paddedLeft =
				left.length < listWidth
					? left + " ".repeat(listWidth - visibleWidth(left))
					: truncateToWidth(left, listWidth, "...", true);

			const sep = theme.fg("borderMuted", "│");
			lines.push(paddedLeft + sep + right);
		}

		// ── Footer ──
		lines.push(theme.fg("borderMuted", "─".repeat(width)));
		lines.push(this.renderFooter(width));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	private renderHeader(width: number): string {
		const theme = this.theme;
		const title = " File Browser ";
		const count = `${this.filteredFiles.length} files`;
		const countColor = this.searchQuery ? "warning" : "muted";
		const header = theme.fg("accent", theme.bold(title));
		const padded = truncateToWidth(
			header +
				" " +
				theme.fg(countColor, count) +
				"  Tab: switch ↑↓: nav  /: search  Esc: close ",
			width,
			"...",
			true,
		);
		return padded;
	}

	private renderSearchBar(width: number): string {
		const theme = this.theme;
		const cursor = "█";
		const text = ` search: ${this.searchQuery}${cursor}`;
		return theme.bg(
			"selectedBg",
			truncateToWidth(theme.fg("text", " " + text), width, "...", true),
		);
	}

	private renderFileList(listWidth: number): string[] {
		const theme = this.theme;
		const lines: string[] = [];
		const maxVisible = 30;

		// Calculate visible range
		const totalFiles = this.filteredFiles.length;
		const maxScroll = Math.max(0, totalFiles - maxVisible);
		this.fileListScrollOffset = Math.max(
			0,
			Math.min(this.fileListScrollOffset, maxScroll),
		);

		// Ensure selected is visible
		if (this.selectedIndex < this.fileListScrollOffset) {
			this.fileListScrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.fileListScrollOffset + maxVisible) {
			this.fileListScrollOffset = this.selectedIndex - maxVisible + 1;
		}

		const end = Math.min(totalFiles, this.fileListScrollOffset + maxVisible);

		for (let i = this.fileListScrollOffset; i < end; i++) {
			const file = this.filteredFiles[i];
			if (!file) continue;

			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? "▸ " : "  ";

			// Color by file type
			const extColor = isMarkdown(file.ext) ? "success" : "muted";
			const sizeStr = formatSize(file.size);
			const dateStr = formatDate(file.modifiedAt);

			let line = prefix + theme.fg("text", file.name);
			line += " " + theme.fg(extColor, file.ext);
			line += " " + theme.fg("dim", `${sizeStr} ${dateStr}`);

			if (file.dir) {
				line += " " + theme.fg("dim", file.dir);
			}

			if (isSelected) {
				const bgFn = (s: string) => theme.bg("selectedBg", s);
				line = bgFn(truncateToWidth(line, listWidth, "…", true));
			} else {
				line = truncateToWidth(line, listWidth, "…", true);
			}

			lines.push(line);
		}

		// Fill remaining space
		while (lines.length < maxVisible) {
			lines.push("");
		}

		return lines;
	}

	private renderPreview(previewWidth: number): string[] {
		const theme = this.theme;
		const lines: string[] = [];
		const maxVisible = 30;

		if (!this.previewContent || !this.previewFile) {
			// Show placeholder
			lines.push(theme.fg("dim", " Select a file to preview"));
			while (lines.length < maxVisible) {
				lines.push("");
			}
			return lines;
		}

		// File info header
		const infoLine = ` ${theme.fg("accent", this.previewFile.name)}  ${theme.fg("dim", formatSize(this.previewFile.size))}  ${theme.fg("dim", "j/k scroll")}`;
		lines.push(truncateToWidth(infoLine, previewWidth, "…", true));
		lines.push(theme.fg("borderMuted", "─".repeat(previewWidth)));

		// Content
		const contentLines = this.previewContent.split("\n");
		const maxContent = Math.min(500, contentLines.length);
		const contentHeight = maxVisible - 2; // minus info + separator

		// Clamp scroll
		const maxScroll = Math.max(0, maxContent - contentHeight);
		this.previewScrollOffset = Math.max(
			0,
			Math.min(this.previewScrollOffset, maxScroll),
		);

		for (
			let i = this.previewScrollOffset;
			i < Math.min(maxContent, this.previewScrollOffset + contentHeight);
			i++
		) {
			const rawLine = contentLines[i] ?? "";
			const lineNum = theme.fg("dim", String(i + 1).padStart(4, " "));
			// Truncate to fit
			const content = truncateToWidth(rawLine, previewWidth - 6, "…", true);
			lines.push(lineNum + " " + content);
		}

		// Fill remaining
		while (lines.length < maxVisible) {
			lines.push("");
		}

		return lines;
	}

	private renderFooter(width: number): string {
		const theme = this.theme;
		const file = this.previewFile;
		const pathInfo = file
			? ` Previewing: ${file.relativePath}`
			: " No file selected";

		let status = ` ${pathInfo}`;
		if (this.previewContent) {
			const lineCount = this.previewContent.split("\n").length;
			status += `  (${lineCount} lines${lineCount >= 500 ? "+" : ""})`;
		}

		return truncateToWidth(theme.fg("dim", status), width, "…", true);
	}
}
