import * as vscode from "vscode";
import { getActiveMarkdownEditor, isTableFormatterEnabled } from "./configuration";

interface TableCell {
	text: string;
}

type Alignment = "left" | "right" | "center" | "none";

interface ParsedTableRow {
	indent: string;
	cells: TableCell[];
}

interface ParsedTable {
	range: vscode.Range;
	rows: ParsedTableRow[];
	alignments: Alignment[];
}

export function registerTableFormatter(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.formatTable", async () => {
			await formatCurrentMarkdownTable();
		})
	);
}

export async function formatCurrentMarkdownTable(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	if (!isTableFormatterEnabled(editor.document.uri)) {
		vscode.window.showInformationMessage("DevSpec table formatter is disabled.");
		return;
	}

	const table = findTableAt(editor.document, editor.selection.active.line);

	if (!table) {
		vscode.window.showWarningMessage("Place the cursor inside a Markdown table first.");
		return;
	}

	const formatted = formatTable(table);

	await editor.edit((editBuilder) => {
		editBuilder.replace(table.range, formatted);
	});
}

export function findTableAt(document: vscode.TextDocument, lineNumber: number): ParsedTable | undefined {
	if (!looksLikeTableLine(document.lineAt(lineNumber).text)) {
		return undefined;
	}

	let startLine = lineNumber;
	let endLine = lineNumber;

	while (startLine > 0 && looksLikeTableLine(document.lineAt(startLine - 1).text)) {
		startLine -= 1;
	}

	while (endLine < document.lineCount - 1 && looksLikeTableLine(document.lineAt(endLine + 1).text)) {
		endLine += 1;
	}

	const rows = range(startLine, endLine).map((line) => parseRow(document.lineAt(line).text));

	if (rows.length < 2) {
		return undefined;
	}

	const separatorIndex = rows.findIndex((row) => isSeparatorRow(row.cells));

	if (separatorIndex < 0) {
		return undefined;
	}

	const alignments = rows[separatorIndex].cells.map((cell) => parseAlignment(cell.text));
	const cleanedRows = rows.filter((_row, index) => index !== separatorIndex);
	const maxColumns = Math.max(...cleanedRows.map((row) => row.cells.length), alignments.length);
	const normalizedRows = cleanedRows.map((row) => normalizeRow(row, maxColumns));
	const normalizedAlignments = normalizeAlignments(alignments, maxColumns);

	return {
		range: new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length),
		rows: normalizedRows,
		alignments: normalizedAlignments
	};
}

export function formatTable(table: ParsedTable): string {
	const widths = calculateColumnWidths(table.rows);
	const indent = table.rows[0]?.indent ?? "";
	const lines: string[] = [];

	for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
		if (rowIndex === 1) {
			lines.push(formatSeparatorRow(indent, widths, table.alignments));
		}

		lines.push(formatDataRow(table.rows[rowIndex], widths, table.alignments));
	}

	if (table.rows.length === 1) {
		lines.push(formatSeparatorRow(indent, widths, table.alignments));
	}

	return lines.join("\n");
}

function looksLikeTableLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.includes("|") && trimmed.length > 0;
}

function parseRow(line: string): ParsedTableRow {
	const indent = line.match(/^\s*/)?.[0] ?? "";
	const trimmed = line.trim();
	const withoutOuter = trimmed.replace(/^\|/, "").replace(/\|$/, "");
	const cells = splitMarkdownTableCells(withoutOuter).map((text) => ({ text: text.trim() }));
	return { indent, cells };
}

function splitMarkdownTableCells(line: string): string[] {
	const cells: string[] = [];
	let current = "";
	let escaped = false;

	for (const char of line) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\") {
			current += char;
			escaped = true;
			continue;
		}

		if (char === "|") {
			cells.push(current);
			current = "";
			continue;
		}

		current += char;
	}

	cells.push(current);
	return cells;
}

function isSeparatorRow(cells: TableCell[]): boolean {
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.text.trim()));
}

function parseAlignment(value: string): Alignment {
	const text = value.trim();
	const left = text.startsWith(":");
	const right = text.endsWith(":");

	if (left && right) return "center";
	if (right) return "right";
	if (left) return "left";
	return "none";
}

function normalizeRow(row: ParsedTableRow, maxColumns: number): ParsedTableRow {
	const cells = [...row.cells];

	while (cells.length < maxColumns) {
		cells.push({ text: "" });
	}

	return { ...row, cells: cells.slice(0, maxColumns) };
}

function normalizeAlignments(alignments: Alignment[], maxColumns: number): Alignment[] {
	const result = [...alignments];

	while (result.length < maxColumns) {
		result.push("none");
	}

	return result.slice(0, maxColumns);
}

function calculateColumnWidths(rows: ParsedTableRow[]): number[] {
	const columnCount = Math.max(...rows.map((row) => row.cells.length));
	const widths = new Array(columnCount).fill(3);

	for (const row of rows) {
		row.cells.forEach((cell, index) => {
			widths[index] = Math.max(widths[index], displayWidth(cell.text));
		});
	}

	return widths;
}

function formatDataRow(row: ParsedTableRow, widths: number[], alignments: Alignment[]): string {
	const cells = row.cells.map((cell, index) => padCell(cell.text, widths[index], alignments[index]));
	return `${row.indent}| ${cells.join(" | ")} |`;
}

function formatSeparatorRow(indent: string, widths: number[], alignments: Alignment[]): string {
	const cells = widths.map((width, index) => {
		const minWidth = Math.max(3, width);
		const alignment = alignments[index];

		if (alignment === "center") {
			return `:${"-".repeat(Math.max(1, minWidth - 2))}:`;
		}

		if (alignment === "right") {
			return `${"-".repeat(Math.max(1, minWidth - 1))}:`;
		}

		if (alignment === "left") {
			return `:${"-".repeat(Math.max(1, minWidth - 1))}`;
		}

		return "-".repeat(minWidth);
	});

	return `${indent}| ${cells.join(" | ")} |`;
}

function padCell(text: string, width: number, alignment: Alignment): string {
	const currentWidth = displayWidth(text);
	const diff = Math.max(0, width - currentWidth);

	if (alignment === "right") {
		return `${" ".repeat(diff)}${text}`;
	}

	if (alignment === "center") {
		const left = Math.floor(diff / 2);
		const right = diff - left;
		return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
	}

	return `${text}${" ".repeat(diff)}`;
}

function displayWidth(value: string): number {
	let width = 0;

	for (const char of Array.from(value)) {
		const code = char.codePointAt(0) ?? 0;
		width += isWideCodePoint(code) ? 2 : 1;
	}

	return width;
}

function isWideCodePoint(code: number): boolean {
	return (
		(code >= 0x1100 && code <= 0x115f) ||
		(code >= 0x2e80 && code <= 0xa4cf) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe10 && code <= 0xfe19) ||
		(code >= 0xfe30 && code <= 0xfe6f) ||
		(code >= 0xff00 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6)
	);
}

function range(start: number, end: number): number[] {
	const result: number[] = [];

	for (let value = start; value <= end; value += 1) {
		result.push(value);
	}

	return result;
}
