import * as vscode from "vscode";
import { getActiveMarkdownEditor } from "./configuration";

interface WrapperOptions {
	left: string;
	right: string;
	placeholder: string;
}

export function registerFormattingCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleBold", () => {
			toggleInlineWrapper({ left: "**", right: "**", placeholder: "bold text" });
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleItalic", () => {
			toggleInlineWrapper({ left: "*", right: "*", placeholder: "italic text" });
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleCodeSpan", () => {
			toggleInlineWrapper({ left: "`", right: "`", placeholder: "code" });
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleMath", () => {
			toggleInlineWrapper({ left: "$", right: "$", placeholder: "E = mc^2" });
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleCodeBlock", async () => {
			await toggleFencedBlock("", "code");
		}),
		vscode.commands.registerCommand("devspecMarkdown.editing.toggleMathBlock", async () => {
			await toggleMathBlock();
		})
	);
}

function toggleInlineWrapper(options: WrapperOptions): void {
	const editor = getActiveMarkdownEditor();

	if (!editor) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	const selections = editor.selections;

	editor.edit((editBuilder) => {
		for (const selection of selections) {
			const selectedText = editor.document.getText(selection);

			if (selection.isEmpty) {
				editBuilder.insert(selection.active, `${options.left}${options.placeholder}${options.right}`);
				continue;
			}

			if (selectedText.startsWith(options.left) && selectedText.endsWith(options.right)) {
				editBuilder.replace(
					selection,
					selectedText.slice(options.left.length, selectedText.length - options.right.length)
				);
			} else {
				editBuilder.replace(selection, `${options.left}${selectedText}${options.right}`);
			}
		}
	}).then((success) => {
		if (!success) {
			return;
		}

		const newSelections = selections.map((selection) => {
			if (!selection.isEmpty) {
				return selection;
			}

			const start = selection.active.translate(0, options.left.length);
			const end = start.translate(0, options.placeholder.length);
			return new vscode.Selection(start, end);
		});

		editor.selections = newSelections;
	});
}

async function toggleFencedBlock(language: string, placeholder: string): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	const selection = editor.selection;
	const selectedText = editor.document.getText(selection);
	const fenceLanguage = language ? language : await askLanguage();

	if (isSelectionWrappedByFence(selectedText)) {
		const unwrapped = selectedText
			.replace(/^```[^\n]*\n?/, "")
			.replace(/\n?```\s*$/, "");
		await editor.edit((editBuilder) => editBuilder.replace(selection, unwrapped));
		return;
	}

	const body = selectedText || placeholder;
	const block = `\`\`\`${fenceLanguage}\n${body}\n\`\`\``;

	await editor.edit((editBuilder) => {
		if (selection.isEmpty) {
			editBuilder.insert(selection.active, block);
		} else {
			editBuilder.replace(selection, block);
		}
	});
}

async function toggleMathBlock(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	const selection = editor.selection;
	const selectedText = editor.document.getText(selection);

	if (selectedText.trim().startsWith("$$") && selectedText.trim().endsWith("$$")) {
		const unwrapped = selectedText
			.replace(/^\s*\$\$\s*\n?/, "")
			.replace(/\n?\s*\$\$\s*$/, "");
		await editor.edit((editBuilder) => editBuilder.replace(selection, unwrapped));
		return;
	}

	const body = selectedText || "E = mc^2";
	const block = `$$\n${body}\n$$`;

	await editor.edit((editBuilder) => {
		if (selection.isEmpty) {
			editBuilder.insert(selection.active, block);
		} else {
			editBuilder.replace(selection, block);
		}
	});
}

function isSelectionWrappedByFence(text: string): boolean {
	return /^```[^\n]*\n[\s\S]*\n```\s*$/.test(text.trim());
}

async function askLanguage(): Promise<string> {
	const language = await vscode.window.showInputBox({
		prompt: "Code block language. Leave empty for plain code block.",
		placeHolder: "java, ts, sql, mermaid, plantuml ..."
	});

	return language?.trim() ?? "";
}
