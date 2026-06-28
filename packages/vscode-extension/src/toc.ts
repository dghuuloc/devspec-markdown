import * as vscode from "vscode";
import { getActiveMarkdownEditor, getTocMaxLevel, getTocMinLevel, getTocTitle } from "./configuration";

const TOC_START = "<!-- DEVSPEC_TOC_START -->";
const TOC_END = "<!-- DEVSPEC_TOC_END -->";

interface HeadingEntry {
	level: number;
	text: string;
	slug: string;
}

export function registerTocCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.toc.insertOrUpdate", async () => {
			await insertOrUpdateToc();
		}),
		vscode.commands.registerCommand("devspecMarkdown.toc.remove", async () => {
			await removeToc();
		})
	);
}

export async function insertOrUpdateToc(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	const document = editor.document;
	const text = document.getText();
	const minLevel = getTocMinLevel(document.uri);
	const maxLevel = getTocMaxLevel(document.uri);
	const title = getTocTitle(document.uri);
	const headings = collectHeadings(text, minLevel, maxLevel);
	const toc = buildToc(title, headings);
	const existingRange = findExistingTocRange(document);

	await editor.edit((editBuilder) => {
		if (existingRange) {
			editBuilder.replace(existingRange, toc);
			return;
		}

		const insertPosition = findTocInsertPosition(document);
		editBuilder.insert(insertPosition, `${toc}\n\n`);
	});
}

export async function removeToc(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor) {
		return;
	}

	const range = findExistingTocRange(editor.document);

	if (!range) {
		vscode.window.showInformationMessage("No DevSpec TOC block found.");
		return;
	}

	await editor.edit((editBuilder) => {
		editBuilder.delete(range);
	});
}

export function collectHeadings(markdown: string, minLevel: number, maxLevel: number): HeadingEntry[] {
	const lines = markdown.split(/\r?\n/);
	const headings: HeadingEntry[] = [];
	const slugCounts = new Map<string, number>();
	let inFence = false;

	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

		if (!match) {
			continue;
		}

		const level = match[1].length;

		if (level < minLevel || level > maxLevel) {
			continue;
		}

		const text = cleanHeadingText(match[2]);

		if (text.length === 0 || text === "Table of Contents") {
			continue;
		}

		const baseSlug = slugify(text);
		const count = slugCounts.get(baseSlug) ?? 0;
		slugCounts.set(baseSlug, count + 1);

		headings.push({
			level,
			text,
			slug: count === 0 ? baseSlug : `${baseSlug}-${count}`
		});
	}

	return headings;
}

export function buildToc(title: string, headings: HeadingEntry[]): string {
	const lines = [TOC_START, `## ${title}`, ""];

	if (headings.length === 0) {
		lines.push("_No headings found._");
	} else {
		for (const heading of headings) {
			const indent = "  ".repeat(Math.max(0, heading.level - 2));
			lines.push(`${indent}- [${heading.text}](#${heading.slug})`);
		}
	}

	lines.push("", TOC_END);
	return lines.join("\n");
}

function findExistingTocRange(document: vscode.TextDocument): vscode.Range | undefined {
	let startLine = -1;
	let endLine = -1;

	for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
		const line = document.lineAt(lineNumber).text.trim();

		if (line === TOC_START) {
			startLine = lineNumber;
		}

		if (line === TOC_END && startLine >= 0) {
			endLine = lineNumber;
			break;
		}
	}

	if (startLine < 0 || endLine < 0) {
		return undefined;
	}

	const end = document.lineAt(endLine).range.end;
	return new vscode.Range(startLine, 0, end.line, end.character);
}

function findTocInsertPosition(document: vscode.TextDocument): vscode.Position {
	for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
		const line = document.lineAt(lineNumber).text;

		if (/^#\s+/.test(line)) {
			return new vscode.Position(Math.min(lineNumber + 2, document.lineCount), 0);
		}
	}

	return new vscode.Position(0, 0);
}

function cleanHeadingText(value: string): string {
	return value
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/`([^`]+)`/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
		.trim()
		.replace(/\s+/g, "-");
}
