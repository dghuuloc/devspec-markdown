import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import {
	renderMarkdownToHtml,
	exportHtmlFileToPdf,
	parseDevSpecDirectives,
	DEFAULT_DEVSPEC_CSS,
	type DevSpecAttributes,
	type DevSpecPdfDirectives
} from "@devspec-markdown/core";

import { DevSpecPreviewPanel } from "./previewPanel";

interface RenderedMarkdownDocument {
	html: string;
	markdown: string;
	title: string;
	pdf: DevSpecPdfDirectives;
	attrs: DevSpecAttributes;
}

function getActiveMarkdownDocument(): vscode.TextDocument | undefined {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		return undefined;
	}

	const document = editor.document;

	if (document.languageId !== "markdown" && !document.fileName.toLowerCase().endsWith(".md")) {
		return undefined;
	}

	return document;
}

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.openPreview", async () => {
			const document = getActiveMarkdownDocument();

			if (!document) {
				vscode.window.showWarningMessage("Open a Markdown file first.");
				return;
			}

			DevSpecPreviewPanel.createOrShow(context, document);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.exportHtml", async () => {
			const document = getActiveMarkdownDocument();

			if (!document) {
				vscode.window.showWarningMessage("Open a Markdown file first.");
				return;
			}

			const rendered = renderCurrentMarkdownToHtml(document);
			const outputPath = document.uri.fsPath.replace(/\.md$/i, ".devspec.html");

			fs.writeFileSync(outputPath, rendered.html, "utf8");

			vscode.window.showInformationMessage(`Exported HTML: ${outputPath}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.exportPdf", async () => {
			const document = getActiveMarkdownDocument();

			if (!document) {
				vscode.window.showWarningMessage("Open a Markdown file first.");
				return;
			}

			const defaultPdfUri = vscode.Uri.file(
				document.uri.fsPath.replace(/\.md$/i, ".devspec.pdf")
			);

			const targetUri = await vscode.window.showSaveDialog({
				defaultUri: defaultPdfUri,
				filters: {
					PDF: ["pdf"]
				},
				saveLabel: "Export PDF"
			});

			if (!targetUri) {
				return;
			}

			const config = vscode.workspace.getConfiguration("devspecMarkdown");
			let browserPath = config.get<string>("browserPath") ?? "";

			if (!browserPath) {
				browserPath = findBrowserPath() ?? "";
			}

			if (!browserPath || !fs.existsSync(browserPath)) {
				const input = await vscode.window.showInputBox({
					title: "Chrome / Edge executable path required",
					prompt: "Enter Chrome or Edge executable path for PDF export.",
					placeHolder: "C:/Program Files/Google/Chrome/Application/chrome.exe"
				});

				if (!input) {
					vscode.window.showWarningMessage("PDF export cancelled. Browser path is required.");
					return;
				}

				browserPath = input;
			}

			if (!fs.existsSync(browserPath)) {
				vscode.window.showErrorMessage(`Browser executable not found: ${browserPath}`);
				return;
			}

			const tempHtmlPath = document.uri.fsPath.replace(/\.md$/i, ".devspec.tmp.html");

			try {
				const rendered = renderCurrentMarkdownToHtml(document);
				fs.writeFileSync(tempHtmlPath, rendered.html, "utf8");

				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: "Exporting DevSpec PDF...",
						cancellable: false
					},
					async () => {
						await exportHtmlFileToPdf({
							htmlFile: tempHtmlPath,
							outputFile: targetUri.fsPath,
							browserPath,

							title: rendered.title,
							fileName: path.basename(document.uri.fsPath),
							owner: rendered.pdf.pdfOwner ?? "",
							version: rendered.pdf.pdfVersion ?? "",

							pdfHeaderLeft: rendered.pdf.pdfHeaderLeft ?? "",
							pdfHeaderCenter: rendered.pdf.pdfHeaderCenter ?? "",
							pdfHeaderRight: rendered.pdf.pdfHeaderRight ?? "",

							pdfFooterLeft: rendered.pdf.pdfFooterLeft ?? "",
							pdfFooterCenter: rendered.pdf.pdfFooterCenter ?? "",
							pdfFooterRight: rendered.pdf.pdfFooterRight ?? "Page {page} / {totalPages}",

							pdfShowHeader: rendered.pdf.pdfShowHeader,
							pdfShowFooter: rendered.pdf.pdfShowFooter,

							pdfHeaderLeftFontSize: rendered.pdf.pdfHeaderLeftFontSize,
							pdfHeaderCenterFontSize: rendered.pdf.pdfHeaderCenterFontSize,
							pdfHeaderRightFontSize: rendered.pdf.pdfHeaderRightFontSize,

							pdfFooterLeftFontSize: rendered.pdf.pdfFooterLeftFontSize,
							pdfFooterCenterFontSize: rendered.pdf.pdfFooterCenterFontSize,
							pdfFooterRightFontSize: rendered.pdf.pdfFooterRightFontSize,

							pdfHeaderLeftFontWeight: rendered.pdf.pdfHeaderLeftFontWeight,
							pdfHeaderCenterFontWeight: rendered.pdf.pdfHeaderCenterFontWeight,
							pdfHeaderRightFontWeight: rendered.pdf.pdfHeaderRightFontWeight,

							pdfFooterLeftFontWeight: rendered.pdf.pdfFooterLeftFontWeight,
							pdfFooterCenterFontWeight: rendered.pdf.pdfFooterCenterFontWeight,
							pdfFooterRightFontWeight: rendered.pdf.pdfFooterRightFontWeight
						});
					}
				);

				const openPdf = "Open PDF";
				const result = await vscode.window.showInformationMessage(
					`Exported PDF: ${targetUri.fsPath}`,
					openPdf
				);

				if (result === openPdf) {
					await vscode.env.openExternal(targetUri);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`PDF export failed: ${message}`);
			} finally {
				fs.rmSync(tempHtmlPath, { force: true });
			}
		})
	);
}

export function deactivate(): void {
	// No cleanup needed.
}

function renderCurrentMarkdownToHtml(document: vscode.TextDocument): RenderedMarkdownDocument {
	const config = vscode.workspace.getConfiguration("devspecMarkdown");
	const projectRoot = resolveProjectRoot(document);
	const diagramSourceDir = resolveDiagramSourceDir(projectRoot, config);
	const parsed = parseDevSpecDirectives(document.getText(), {
		inputFile: document.uri.fsPath
	});

	const title =
		parsed.pdf.pdfTitle ??
		extractMarkdownTitle(parsed.markdown) ??
		"DevSpec Markdown";

	const html = renderMarkdownToHtml({
		markdown: parsed.markdown,
		baseDir: projectRoot,
		diagramSourceDir,
		css: buildDocumentCss(parsed.attrs, path.dirname(document.uri.fsPath)),
		title,
		tocEnabled: parsed.attrs.toc ?? false,
		tocTitle: parsed.attrs.tocTitle,
		tocMaxLevel: parsed.attrs.tocLevels,
		sourceLanguage: parsed.attrs.sourceLanguage,
		plantuml: {
			jarPath: config.get<string>("plantumlJarPath") || undefined,
			securityProfile: getPlantUmlSecurityProfile(config),
			cwd: path.dirname(document.uri.fsPath),
			force: true,
			skipIfUncached: false
		},
		sectionNumbering: {
			enabled: parsed.attrs.sectNums ?? (config.get<boolean>("sectionNumbering") ?? true),
			minLevel: config.get<number>("sectionNumberMinLevel") ?? 2,
			maxLevel: parsed.attrs.sectNumLevels ?? (config.get<number>("sectionNumberMaxLevel") ?? 4),
			stripExisting: config.get<boolean>("stripExistingSectionNumbers") ?? true
		},
		imageUriResolver: (src) => {
			if (/^(https?:|data:|file:)/i.test(src)) {
				return src;
			}

			return pathToFileURL(path.resolve(resolveImageBaseDir(document, parsed.attrs), src)).toString();
		}
	}).html;

	return {
		html,
		markdown: parsed.markdown,
		title,
		pdf: parsed.pdf,
		attrs: parsed.attrs
	};
}

function buildDocumentCss(attrs: DevSpecAttributes, documentDir: string): string {
	if (!attrs.stylesheet) {
		return DEFAULT_DEVSPEC_CSS;
	}

	const stylesDir = attrs.stylesDir
		? path.resolve(documentDir, attrs.stylesDir)
		: documentDir;
	const stylesheetPath = path.resolve(stylesDir, attrs.stylesheet);

	if (!fs.existsSync(stylesheetPath)) {
		return DEFAULT_DEVSPEC_CSS;
	}

	return `${DEFAULT_DEVSPEC_CSS}

/* Custom stylesheet: ${stylesheetPath} */
${fs.readFileSync(stylesheetPath, "utf8")}`;
}

function resolveImageBaseDir(document: vscode.TextDocument, attrs: DevSpecAttributes): string {
	if (!attrs.imagesDir) {
		return path.dirname(document.uri.fsPath);
	}

	return path.resolve(path.dirname(document.uri.fsPath), attrs.imagesDir);
}

function extractMarkdownTitle(markdown: string): string | undefined {
	const match = markdown.match(/^#\s+(.+?)\s*$/m);

	if (!match) {
		return undefined;
	}

	return match[1]
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function getPlantUmlSecurityProfile(
	config: vscode.WorkspaceConfiguration
): "SECURE" | "UNSECURE" {
	const value = config.get<string>("plantumlSecurityProfile") ?? "SECURE";

	if (value === "UNSECURE") {
		return "UNSECURE";
	}

	return "SECURE";
}

function resolveProjectRoot(document: vscode.TextDocument): string {
	let currentDir = path.dirname(document.uri.fsPath);

	while (true) {
		const expectedDiagramDir = path.join(currentDir, "docs", "diagrams", "src");

		if (fs.existsSync(expectedDiagramDir)) {
			return currentDir;
		}

		const packageJson = path.join(currentDir, "package.json");
		const packagesDir = path.join(currentDir, "packages");

		if (fs.existsSync(packageJson) && fs.existsSync(packagesDir)) {
			return currentDir;
		}

		const parentDir = path.dirname(currentDir);

		if (parentDir === currentDir) {
			break;
		}

		currentDir = parentDir;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
	return workspaceFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath);
}

function resolveDiagramSourceDir(
	projectRoot: string,
	config: vscode.WorkspaceConfiguration
): string {
	const rawDiagramSourceDir =
		config.get<string>("diagramSourceDir") ?? "docs/diagrams/src";

	if (path.isAbsolute(rawDiagramSourceDir)) {
		return rawDiagramSourceDir;
	}

	return path.resolve(projectRoot, rawDiagramSourceDir);
}

function findBrowserPath(): string | undefined {
	const candidates: string[] = [];

	if (process.platform === "win32") {
		candidates.push(
			"C:/Program Files/Google/Chrome/Application/chrome.exe",
			"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
			"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
			"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
		);
	}

	if (process.platform === "darwin") {
		candidates.push(
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
		);
	}

	if (process.platform === "linux") {
		candidates.push(
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/usr/bin/microsoft-edge"
		);
	}

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}