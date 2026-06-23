import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as nodeProcess from "process";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

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
			const browserPath = findBrowserPath(config);

			if (!browserPath) {
				const remoteName = vscode.env.remoteName;
				const message = remoteName
					? `DevSpec PDF export could not find Chrome, Edge, Brave, or Chromium in the ${remoteName} environment. If you are using a Dev Container, install Chromium inside the container and try again.`
					: "DevSpec PDF export could not find Chrome, Edge, Brave, or Chromium. Please install one of these browsers and try again.";

				vscode.window.showErrorMessage(message);
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

function findBrowserPath(config?: vscode.WorkspaceConfiguration): string | undefined {
	const configuredPath = config?.get<string>("browserPath")?.trim();
	const configuredBrowser = existingFile(configuredPath);

	if (configuredBrowser) {
		return configuredBrowser;
	}

	const envBrowser =
		existingFile(nodeProcess.env.DEVSPEC_BROWSER_PATH) ??
		existingFile(nodeProcess.env.PUPPETEER_EXECUTABLE_PATH) ??
		existingFile(nodeProcess.env.CHROME_PATH) ??
		existingFile(nodeProcess.env.EDGE_PATH);

	if (envBrowser) {
		return envBrowser;
	}

	for (const candidate of getKnownBrowserPaths()) {
		const browser = existingFile(candidate);

		if (browser) {
			return browser;
		}
	}

	if (nodeProcess.platform === "win32") {
		const registryBrowser = findBrowserFromWindowsRegistry();

		if (registryBrowser) {
			return registryBrowser;
		}
	}

	return findBrowserFromPath();
}

function getKnownBrowserPaths(): string[] {
	const candidates: string[] = [];

	if (nodeProcess.platform === "win32") {
		const programFiles = nodeProcess.env.ProgramFiles ?? "C:\\Program Files";
		const programFilesX86 = nodeProcess.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
		const programW6432 = nodeProcess.env.ProgramW6432 ?? programFiles;
		const localAppData =
			nodeProcess.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");

		candidates.push(
			path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
			path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
			path.join(programW6432, "Microsoft", "Edge", "Application", "msedge.exe"),
			path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),

			path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
			path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
			path.join(programW6432, "Google", "Chrome", "Application", "chrome.exe"),
			path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),

			path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
			path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
			path.join(programW6432, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
			path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
		);
	}

	if (nodeProcess.platform === "darwin") {
		candidates.push(
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			path.join(os.homedir(), "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
			path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
			path.join(os.homedir(), "Applications", "Brave Browser.app", "Contents", "MacOS", "Brave Browser")
		);
	}

	if (nodeProcess.platform === "linux") {
		candidates.push(
			"/usr/bin/microsoft-edge",
			"/usr/bin/microsoft-edge-stable",
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/usr/bin/brave-browser",
			"/snap/bin/chromium"
		);
	}

	return candidates;
}

function findBrowserFromWindowsRegistry(): string | undefined {
	const appNames = ["msedge.exe", "chrome.exe", "brave.exe"];
	const registryRoots = [
		"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
		"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
		"HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths"
	];

	for (const appName of appNames) {
		for (const registryRoot of registryRoots) {
			const result = spawnSync(
				"reg.exe",
				["query", `${registryRoot}\\${appName}`, "/ve"],
				{
					encoding: "utf8",
					windowsHide: true,
					stdio: ["ignore", "pipe", "ignore"]
				}
			);

			if (result.error || result.status !== 0 || !result.stdout) {
				continue;
			}

			const browserPath = parseDefaultRegistryValue(result.stdout);
			const browser = existingFile(browserPath);

			if (browser) {
				return browser;
			}
		}
	}

	return undefined;
}

function parseDefaultRegistryValue(output: string): string | undefined {
	for (const line of output.split(/\r?\n/)) {
		const match = line.match(/^\s*\(Default\)\s+REG_SZ\s+(.+?)\s*$/i);

		if (match) {
			return match[1].trim();
		}
	}

	return undefined;
}

function findBrowserFromPath(): string | undefined {
	const commands =
		nodeProcess.platform === "win32"
			? [
				"msedge.exe",
				"msedge",
				"chrome.exe",
				"chrome",
				"brave.exe",
				"brave"
			]
			: [
				"microsoft-edge",
				"microsoft-edge-stable",
				"google-chrome",
				"google-chrome-stable",
				"chromium",
				"chromium-browser",
				"brave-browser"
			];

	for (const command of commands) {
		const found = findCommand(command);
		const browser = existingFile(found);

		if (browser) {
			return browser;
		}
	}

	return undefined;
}

function findCommand(command: string): string | undefined {
	const lookupCommand = nodeProcess.platform === "win32" ? "where.exe" : "which";

	const result = spawnSync(lookupCommand, [command], {
		encoding: "utf8",
		windowsHide: true,
		stdio: ["ignore", "pipe", "ignore"]
	});

	if (result.error || result.status !== 0) {
		return undefined;
	}

	const stdout = result.stdout?.toString() ?? "";

	return stdout
		.split(/\r?\n/)
		.map((line: string) => line.trim())
		.find(Boolean);
}

function existingFile(value?: string): string | undefined {
	if (!value) {
		return undefined;
	}

	const expandedPath = expandHomePath(stripWrappingQuotes(value));

	try {
		const stat = fs.statSync(expandedPath);

		if (stat.isFile()) {
			return expandedPath;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function stripWrappingQuotes(value: string): string {
	const trimmed = value.trim();

	if (
		(trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function expandHomePath(value: string): string {
	if (value === "~") {
		return os.homedir();
	}

	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(os.homedir(), value.slice(2));
	}

	return value;
}