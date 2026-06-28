import * as vscode from "vscode";
import { isKatexCompletionEnabled, isMarkdownDocument } from "./configuration";
import { KATEX_COMPLETIONS } from "./util/katex-funcs";

export function registerCompletionProviders(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: "markdown", scheme: "file" },
			new KatexCompletionProvider(),
			"\\"
		)
	);
}

class KatexCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): vscode.ProviderResult<vscode.CompletionItem[]> {
		if (!isMarkdownDocument(document) || !isKatexCompletionEnabled(document.uri)) {
			return undefined;
		}

		const linePrefix = document.lineAt(position).text.slice(0, position.character);
		const activeCommand = linePrefix.match(/\\[A-Za-z]*$/);

		if (!activeCommand) {
			return undefined;
		}

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
}
