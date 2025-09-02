/**
 * Tests for FileBrowser file scanning and helper functions.
 *
 * Tests the pure logic functions (scanFiles, isTextFile, isMarkdown,
 * formatSize, formatDate) using real file fixtures.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ─── Inline helpers (copied from FileBrowser.ts for test isolation) ─────

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

const MAX_FILE_SIZE = 1024 * 1024;

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

function isMarkdown(ext: string): boolean {
	return ext === "md" || ext === "mdx";
}

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

interface FileEntry {
	relativePath: string;
	absolutePath: string;
	size: number;
	modifiedAt: Date;
	ext: string;
	name: string;
	dir: string;
}

function scanFiles(rootDir: string): FileEntry[] {
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

	results.sort((a, b) => {
		const aDir = a.dir + "/" + a.name;
		const bDir = b.dir + "/" + b.name;
		return aDir.localeCompare(bDir);
	});

	return results;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("isTextFile", () => {
	it("identifies markdown files as text", () => {
		expect(isTextFile("/some/path/doc.md")).toBe(true);
		expect(isTextFile("/some/path/doc.MD")).toBe(true);
		expect(isTextFile("/some/path/doc.mdx")).toBe(true);
	});

	it("identifies common text files", () => {
		expect(isTextFile("file.txt")).toBe(true);
		expect(isTextFile("file.json")).toBe(true);
		expect(isTextFile("file.ts")).toBe(true);
		expect(isTextFile("file.js")).toBe(true);
		expect(isTextFile("file.yaml")).toBe(true);
		expect(isTextFile("file.yml")).toBe(true);
		expect(isTextFile("file.css")).toBe(true);
		expect(isTextFile("file.html")).toBe(true);
		expect(isTextFile("file.py")).toBe(true);
		expect(isTextFile("file.sh")).toBe(true);
		expect(isTextFile("file.toml")).toBe(true);
	});

	it("identifies Dockerfile and Makefile as text", () => {
		expect(isTextFile("/path/Dockerfile")).toBe(true);
		expect(isTextFile("/path/Makefile")).toBe(true);
		expect(isTextFile("/path/subdir/Dockerfile")).toBe(true);
	});

	it("identifies dot files as text", () => {
		expect(isTextFile("/path/.gitignore")).toBe(true);
		expect(isTextFile("/path/.dockerignore")).toBe(true);
	});

	it("identifies .env as text", () => {
		expect(isTextFile("/path/.env")).toBe(true);
	});

	it("rejects binary files", () => {
		expect(isTextFile("file.png")).toBe(false);
		expect(isTextFile("file.jpg")).toBe(false);
		expect(isTextFile("file.mp4")).toBe(false);
		expect(isTextFile("file.zip")).toBe(false);
		expect(isTextFile("file.exe")).toBe(false);
		expect(isTextFile("file.o")).toBe(false);
	});
});

describe("isMarkdown", () => {
	it("detects md and mdx", () => {
		expect(isMarkdown("md")).toBe(true);
		expect(isMarkdown("mdx")).toBe(true);
	});

	it("rejects non-markdown", () => {
		expect(isMarkdown("ts")).toBe(false);
		expect(isMarkdown("json")).toBe(false);
		expect(isMarkdown("txt")).toBe(false);
		expect(isMarkdown("")).toBe(false);
	});
});

describe("formatSize", () => {
	it("formats small sizes in bytes", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(500)).toBe("500 B");
		expect(formatSize(1023)).toBe("1023 B");
	});

	it("formats KB sizes", () => {
		expect(formatSize(1024)).toBe("1.0 KB");
		expect(formatSize(1536)).toBe("1.5 KB");
		expect(formatSize(51200)).toBe("50.0 KB");
	});

	it("formats MB sizes", () => {
		expect(formatSize(1048576)).toBe("1.0 MB");
		expect(formatSize(5242880)).toBe("5.0 MB");
	});
});

describe("formatDate", () => {
	it("returns a time-like string for today", () => {
		const today = new Date();
		const result = formatDate(today);
		// Should be HH:MM format (with colon)
		expect(result).toMatch(/^\d{2}:\d{2}$/);
	});

	it("returns a date string for past dates", () => {
		const past = new Date("2024-01-15");
		const result = formatDate(past);
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
	});
});

describe("scanFiles", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-browser-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns empty array for empty directory", () => {
		const results = scanFiles(tmpDir);
		expect(results).toEqual([]);
	});

	it("finds text files and skips binaries", () => {
		fs.writeFileSync(path.join(tmpDir, "readme.md"), "# Hello");
		fs.writeFileSync(path.join(tmpDir, "config.json"), "{}");
		fs.writeFileSync(path.join(tmpDir, "app.ts"), "const x = 1;");
		fs.writeFileSync(path.join(tmpDir, "photo.png"), "fake binary");

		const results = scanFiles(tmpDir);
		const names = results.map((r) => r.name);

		expect(names).toContain("readme.md");
		expect(names).toContain("config.json");
		expect(names).toContain("app.ts");
		expect(names).not.toContain("photo.png");
	});

	it("skips node_modules directory", () => {
		const nmDir = path.join(tmpDir, "node_modules");
		fs.mkdirSync(nmDir);
		fs.writeFileSync(path.join(nmDir, "lib.js"), "module.exports=1");

		const results = scanFiles(tmpDir);
		expect(results).toHaveLength(0);
	});

	it("skips .git directory", () => {
		const gitDir = path.join(tmpDir, ".git");
		fs.mkdirSync(gitDir);
		fs.writeFileSync(path.join(gitDir, "config.txt"), "config");

		const results = scanFiles(tmpDir);
		expect(results).toHaveLength(0);
	});

	it("skips hidden directories (starting with dot)", () => {
		const dotDir = path.join(tmpDir, ".cache");
		fs.mkdirSync(dotDir);
		fs.writeFileSync(path.join(dotDir, "cache.json"), "{}");

		const results = scanFiles(tmpDir);
		expect(results).toHaveLength(0);
	});

	it("recursively scans subdirectories", () => {
		fs.writeFileSync(path.join(tmpDir, "root.md"), "# root");
		const subDir = path.join(tmpDir, "docs");
		fs.mkdirSync(subDir);
		fs.writeFileSync(path.join(subDir, "guide.md"), "# guide");

		const results = scanFiles(tmpDir);
		const names = results.map((r) => r.name);
		expect(names).toContain("root.md");
		expect(names).toContain("guide.md");
		expect(results).toHaveLength(2);
	});

	it("includes dir field in results", () => {
		const subDir = path.join(tmpDir, "src", "components");
		fs.mkdirSync(subDir, { recursive: true });
		fs.writeFileSync(path.join(subDir, "Button.ts"), "export{}");

		const results = scanFiles(tmpDir);
		expect(results).toHaveLength(1);
		if (results[0]) {
			expect(results[0].dir).toBe("src/components");
		}
	});

	it("sorts results by relative path", () => {
		fs.writeFileSync(path.join(tmpDir, "zebra.md"), "z");
		fs.writeFileSync(path.join(tmpDir, "apple.md"), "a");
		fs.writeFileSync(path.join(tmpDir, "banana.json"), "b");

		const results = scanFiles(tmpDir);
		const sorted = results.map((r) => r.name);
		expect(sorted).toEqual(["apple.md", "banana.json", "zebra.md"]);
	});

	it("sets correct ext field", () => {
		fs.writeFileSync(path.join(tmpDir, "test.TS"), "x");
		fs.writeFileSync(path.join(tmpDir, "other.md"), "x");

		const results = scanFiles(tmpDir);
		const exts = results.map((r) => r.ext);
		expect(exts).toContain("ts");
		expect(exts).toContain("md");
	});

	it("handles directories that cannot be read", () => {
		// This just shouldn't crash
		const results = scanFiles("/nonexistent/path/12345");
		expect(results).toEqual([]);
	});
});
