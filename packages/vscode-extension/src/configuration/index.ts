import * as vscode from "vscode";

export const DEVSPEC_CONFIG_SECTION = "devspecMarkdown";

export function getDevSpecConfig(resource?: vscode.Uri): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(DEVSPEC_CONFIG_SECTION, resource);
}

export function isMarkdownDocument(document: vscode.TextDocument | undefined): document is vscode.TextDocument {
	if (!document) {
		return false;
	}

	return document.languageId === "markdown" || document.fileName.toLowerCase().endsWith(".md");
}

export function getActiveMarkdownEditor(): vscode.TextEditor | undefined {
	const editor = vscode.window.activeTextEditor;

	if (!editor || !isMarkdownDocument(editor.document)) {
		return undefined;
	}

	return editor;
}

export function isTableFormatterEnabled(resource?: vscode.Uri): boolean {
	return getDevSpecConfig(resource).get<boolean>("tableFormatter.enabled", true);
}

export function isKatexCompletionEnabled(resource?: vscode.Uri): boolean {
	return getDevSpecConfig(resource).get<boolean>("completion.katex.enabled", true);
}

export function isListEditingEnabled(resource?: vscode.Uri): boolean {
	return getDevSpecConfig(resource).get<boolean>("listEditing.enabled", true);
}

export function getTocMinLevel(resource?: vscode.Uri): number {
	return getDevSpecConfig(resource).get<number>("toc.minLevel", 2);
}

export function getTocMaxLevel(resource?: vscode.Uri): number {
	return getDevSpecConfig(resource).get<number>("toc.maxLevel", 4);
}

export function getTocTitle(resource?: vscode.Uri): string {
	return getDevSpecConfig(resource).get<string>("toc.title", "Table of Contents");
}
