import * as vscode from "vscode";
import { getActiveMarkdownEditor, isListEditingEnabled } from "./configuration";

const TASK_ITEM_PATTERN = /^(\s*)([-*+]\s+)\[([ xX])\]\s+(.*)$/;
const BULLET_ITEM_PATTERN = /^(\s*)([-*+]\s+)(.*)$/;
const ORDERED_ITEM_PATTERN = /^(\s*)(\d+\.\s+)(.*)$/;

export function registerListEditingCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleTaskList", async () => {
			await toggleTaskList();
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleTaskCheck", async () => {
			await toggleTaskCheck();
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleBulletList", async () => {
			await toggleBulletList();
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleNumberedList", async () => {
			await toggleNumberedList();
		})
	);
}

async function toggleTaskList(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isListEditingEnabled(editor.document.uri)) {
		return;
	}

	await transformSelectedLines(editor, (lineText) => {
		const taskMatch = lineText.match(TASK_ITEM_PATTERN);

		if (taskMatch) {
			return `${taskMatch[1]}${taskMatch[2]}${taskMatch[4]}`;
		}

		const bulletMatch = lineText.match(BULLET_ITEM_PATTERN);

		if (bulletMatch) {
			return `${bulletMatch[1]}${bulletMatch[2]}[ ] ${bulletMatch[3]}`;
		}

		const orderedMatch = lineText.match(ORDERED_ITEM_PATTERN);

		if (orderedMatch) {
			return `${orderedMatch[1]}- [ ] ${orderedMatch[3]}`;
		}

		if (lineText.trim().length === 0) {
			return lineText;
		}

		const indent = lineText.match(/^\s*/)?.[0] ?? "";
		return `${indent}- [ ] ${lineText.trim()}`;
	});
}

async function toggleTaskCheck(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isListEditingEnabled(editor.document.uri)) {
		return;
	}

	await transformSelectedLines(editor, (lineText) => {
		const match = lineText.match(TASK_ITEM_PATTERN);

		if (!match) {
			return lineText;
		}

		const next = match[3].toLowerCase() === "x" ? " " : "x";
		return `${match[1]}${match[2]}[${next}] ${match[4]}`;
	});
}

async function toggleBulletList(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isListEditingEnabled(editor.document.uri)) {
		return;
	}

	await transformSelectedLines(editor, (lineText) => {
		const bulletMatch = lineText.match(BULLET_ITEM_PATTERN);

		if (bulletMatch) {
			return `${bulletMatch[1]}${bulletMatch[3]}`;
		}

		const orderedMatch = lineText.match(ORDERED_ITEM_PATTERN);

		if (orderedMatch) {
			return `${orderedMatch[1]}- ${orderedMatch[3]}`;
		}

		if (lineText.trim().length === 0) {
			return lineText;
		}

		const indent = lineText.match(/^\s*/)?.[0] ?? "";
		return `${indent}- ${lineText.trim()}`;
	});
}

async function toggleNumberedList(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isListEditingEnabled(editor.document.uri)) {
		return;
	}

	const selectedLines = getSelectedLineNumbers(editor);
	let counter = 1;

	await editor.edit((editBuilder) => {
		for (const lineNumber of selectedLines) {
			const line = editor.document.lineAt(lineNumber);
			const oldText = line.text;
			let newText = oldText;

			const orderedMatch = oldText.match(ORDERED_ITEM_PATTERN);

			if (orderedMatch) {
				newText = `${orderedMatch[1]}${orderedMatch[3]}`;
			} else {
				const bulletMatch = oldText.match(BULLET_ITEM_PATTERN);
				const content = bulletMatch ? bulletMatch[3] : oldText.trim();
				const indent = bulletMatch ? bulletMatch[1] : oldText.match(/^\s*/)?.[0] ?? "";

				if (content.length > 0) {
					newText = `${indent}${counter}. ${content}`;
					counter += 1;
				}
			}

			editBuilder.replace(line.range, newText);
		}
	});
}

async function transformSelectedLines(
	editor: vscode.TextEditor,
	transform: (lineText: string, lineNumber: number) => string
): Promise<void> {
	const selectedLines = getSelectedLineNumbers(editor);

	await editor.edit((editBuilder) => {
		for (const lineNumber of selectedLines) {
			const line = editor.document.lineAt(lineNumber);
			editBuilder.replace(line.range, transform(line.text, lineNumber));
		}
	});
}

function getSelectedLineNumbers(editor: vscode.TextEditor): number[] {
	const lines = new Set<number>();

	for (const selection of editor.selections) {
		const start = selection.start.line;
		const end = selection.end.character === 0 && selection.end.line > start
			? selection.end.line - 1
			: selection.end.line;

		for (let line = start; line <= end; line += 1) {
			lines.add(line);
		}
	}

	return Array.from(lines).sort((a, b) => a - b);
}
