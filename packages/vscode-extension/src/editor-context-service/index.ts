import * as vscode from "vscode";
import { isMarkdownDocument } from "../configuration";

const CONTEXT_IN_FENCED_CODE_BLOCK = "devspecMarkdown.editor.cursor.inFencedCodeBlock";
const CONTEXT_IN_MATH_ENV = "devspecMarkdown.editor.cursor.inMathEnv";
const CONTEXT_IN_LIST = "devspecMarkdown.editor.cursor.inList";

export function registerEditorContextService(context: vscode.ExtensionContext): void {
	const service = new EditorContextService();

	context.subscriptions.push(
		service,
		vscode.window.onDidChangeActiveTextEditor(() => service.update()),
		vscode.window.onDidChangeTextEditorSelection(() => service.update()),
		vscode.workspace.onDidChangeTextDocument(() => service.update())
	);

	void service.update();
}

class EditorContextService implements vscode.Disposable {
	private disposed = false;
	private updateTimer: NodeJS.Timeout | undefined;

	update(): void {
		if (this.disposed) {
			return;
		}

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		this.updateTimer = setTimeout(() => {
			void this.updateNow();
		}, 40);
	}

	dispose(): void {
		this.disposed = true;

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
	}

	private async updateNow(): Promise<void> {
		const editor = vscode.window.activeTextEditor;

		if (!editor || !isMarkdownDocument(editor.document)) {
			await setEditorContexts(false, false, false);
			return;
		}

		const position = editor.selection.active;
		const document = editor.document;

		await setEditorContexts(
			isInsideFencedCodeBlock(document, position),
			isInsideMathBlock(document, position),
			isListLine(document.lineAt(position.line).text)
		);
	}
}

async function setEditorContexts(
	inFencedCodeBlock: boolean,
	inMathEnv: boolean,
	inList: boolean
): Promise<void> {
	await Promise.all([
		vscode.commands.executeCommand("setContext", CONTEXT_IN_FENCED_CODE_BLOCK, inFencedCodeBlock),
		vscode.commands.executeCommand("setContext", CONTEXT_IN_MATH_ENV, inMathEnv),
		vscode.commands.executeCommand("setContext", CONTEXT_IN_LIST, inList)
	]);
}

function isInsideFencedCodeBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
	let inFence = false;

	for (let lineNumber = 0; lineNumber <= position.line; lineNumber += 1) {
		const line = document.lineAt(lineNumber).text;

		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
		}
	}

	return inFence;
}

function isInsideMathBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
	let inMath = false;

	for (let lineNumber = 0; lineNumber <= position.line; lineNumber += 1) {
		const line = document.lineAt(lineNumber).text;
		const matches = line.match(/(^|[^\\])\$\$/g);

		if (!matches) {
			continue;
		}

		if (matches.length % 2 === 1) {
			inMath = !inMath;
		}
	}

	return inMath;
}

function isListLine(line: string): boolean {
	return /^\s*([-*+]\s+|\d+\.\s+)/.test(line);
}
