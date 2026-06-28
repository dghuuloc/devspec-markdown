import * as vscode from "vscode";
import { isKatexCompletionEnabled, isMarkdownDocument, getDevSpecConfig } from "./configuration";
import { getDevSpecCompletionMatch } from "./completions/devspecCompletion";
import { getDiagramCompletionMatch } from "./completions/diagramCompletion";
import { KATEX_COMPLETIONS } from "./util/katex-funcs";

export function registerCompletionProviders(context: vscode.ExtensionContext): void {
	const selector: vscode.DocumentSelector = [
		{ language: "markdown", scheme: "file" },
		{ language: "markdown", scheme: "untitled" }
	];

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			selector,
			new DevSpecMarkdownCompletionProvider(),
			"\\",
			"d",
			"s",
			":",
			"`"
		)
	);
}

class DevSpecMarkdownCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.ProviderResult<vscode.CompletionItem[]> {
		if (!isMarkdownDocument(document)) {
			return undefined;
		}

		const katexItems = getKatexCompletionItems(document, position);
		if (katexItems && katexItems.length > 0) {
			return katexItems;
		}

		if (!isDevSpecCompletionEnabled(document.uri)) {
			return undefined;
		}

		const diagramMatch = getDiagramCompletionMatch(document, position);
		if (diagramMatch) {
			return diagramMatch.items;
		}

		if (isInsideFencedCodeBlock(document, position)) {
			return undefined;
		}

		const devspecMatch = getDevSpecCompletionMatch(document, position);
		if (devspecMatch) {
			return devspecMatch.items;
		}

		return undefined;
	}
}

function getKatexCompletionItems(
	document: vscode.TextDocument,
	position: vscode.Position
): vscode.CompletionItem[] | undefined {
	if (!isKatexCompletionEnabled(document.uri)) {
		return undefined;
	}

	if (isInsideFencedCodeBlock(document, position)) {
		return undefined;
	}

	const linePrefix = document.lineAt(position).text.slice(0, position.character);
	const activeCommand = linePrefix.match(/\\[A-Za-z]*$/);

	if (!activeCommand) {
		return undefined;
	}

	// Important: replace the whole typed command including the leading backslash.
	// Example: user typed "\\fr" -> range replaces "\\fr", not only "fr".
	// This prevents inserting "\\\\frac".
	const replaceRange = new vscode.Range(
		position.line,
		position.character - activeCommand[0].length,
		position.line,
		position.character
	);

	return KATEX_COMPLETIONS.map((entry) => {
		const item = new vscode.CompletionItem(
			`\\${entry.label}`,
			vscode.CompletionItemKind.Function
		);

		item.detail = entry.detail;
		item.documentation = new vscode.MarkdownString(entry.documentation);
		item.insertText = new vscode.SnippetString(entry.insertText);
		item.range = replaceRange;
		item.filterText = `\\${entry.label}`;
		item.sortText = `0_${entry.label}`;

		return item;
	});
}

function isDevSpecCompletionEnabled(resource?: vscode.Uri): boolean {
	return getDevSpecConfig(resource).get<boolean>("completion.devspec.enabled", true);
}

function isInsideFencedCodeBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
	let fenceCount = 0;

	for (let lineNumber = 0; lineNumber <= position.line; lineNumber += 1) {
		const text = document.lineAt(lineNumber).text.trim();

		if (/^(`{3,}|~{3,})/.test(text)) {
			fenceCount += 1;
		}
	}

	return fenceCount % 2 === 1;
}
