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

import {
	installMissingDependencies,
	maybePromptForMissingDependencies,
	resetDependencyPrompt,
	showDependencyStatus
} from "./dependencyManager";

import { registerCompletionProviders } from "./completion";
import { registerEditorContextService } from "./editor-context-service";
import { registerFormattingCommands } from "./formatting";
import { registerListEditingCommands } from "./listEditing";
import { registerTableFormatter } from "./tableFormatter";
import { registerTocCommands } from "./toc";

/**
 * The fully rendered output produced from a Markdown document.
 * Returned by {@link renderCurrentMarkdownToHtml} and consumed by the
 * export commands and the PDF exporter.
 */
interface RenderedMarkdownDocument {
	/** Complete HTML document string, ready to write to disk or pass to Puppeteer. */
	html: string;
	/** Cleaned Markdown source after DevSpec directives have been stripped. */
	markdown: string;
	/** Document title extracted from the first ATX heading or the `:pdf-title:` attribute. */
	title: string;
	/** PDF header, footer, and metadata directives parsed from `:pdf-*:` attributes. */
	pdf: DevSpecPdfDirectives;
	/** Document attributes parsed from `:key: value` directives (TOC, section numbers, stylesheet …). */
	attrs: DevSpecAttributes;
}

/**
 * Returns the {@link vscode.TextDocument} of the currently active text editor
 * if — and only if — that editor contains a Markdown file.
 *
 * A file is considered Markdown when its `languageId` is `"markdown"` or its
 * file name ends with `.md` (case-insensitive).
 *
 * @returns The active Markdown document, or `undefined` when no Markdown
 *   editor is focused.
 */
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

/**
 * Extension activation entry point called by VS Code when any of the
 * registered `activationEvents` fire:
 * - `onCommand:devspecMarkdown.openPreview`
 * - `onCommand:devspecMarkdown.exportHtml`
 * - `onCommand:devspecMarkdown.exportPdf`
 *
 * Registers three commands and pushes their disposables onto
 * `context.subscriptions` so they are automatically cleaned up when the
 * extension is deactivated.
 *
 * @param context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext): void {

	registerEditorContextService(context);
	registerCompletionProviders(context);
	registerFormattingCommands(context);
	registerListEditingCommands(context);
	registerTableFormatter(context);
	registerTocCommands(context);

	// command: Open Preview
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
		vscode.commands.registerCommand("devspecMarkdown.previewZoomIn", () => {
			DevSpecPreviewPanel.zoomActivePreviewIn();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.previewZoomOut", () => {
			DevSpecPreviewPanel.zoomActivePreviewOut();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.previewZoomReset", () => {
			DevSpecPreviewPanel.resetActivePreviewZoom();
		})
	);

	// command: Export HTML
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

	// command: Export PDF
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
				const installLabel = "Install Dependencies";
				const detailsLabel = "Show Details";
				const remoteName = vscode.env.remoteName;

				const message = remoteName
					? `DevSpec PDF export could not find Chrome, Edge, Brave, or Chromium in the ${remoteName} environment.`
					: "DevSpec PDF export could not find Chrome, Edge, Brave, or Chromium.";

				const result = await vscode.window.showErrorMessage(
					message,
					installLabel,
					detailsLabel
				);

				if (result === installLabel) {
					installMissingDependencies();
				}

				if (result === detailsLabel) {
					await showDependencyStatus();
				}

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

	// command: Check dependencies
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.checkDependencies", async () => {
			await showDependencyStatus();
		})
	);

	// command: Install dependencies
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.installDependencies", () => {
			installMissingDependencies();
		})
	);

	// command: Reset dependency prompt
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.resetDependencyPrompt", async () => {
			await resetDependencyPrompt(context);
		})
	);

	void maybePromptForMissingDependencies(context);
}

/**
 * Extension deactivation hook called by VS Code before the extension host
 * is torn down. All disposables were registered via `context.subscriptions`
 * in {@link activate}, so no explicit cleanup is necessary here.
 */
export function deactivate(): void {
	// No cleanup needed.
}

/**
 * Central rendering pipeline for the export commands.
 *
 * Reads all relevant VS Code settings, parses DevSpec directives from the
 * document text, and calls `renderMarkdownToHtml` from
 * `@devspec-markdown/core`. Image URIs are resolved to `file://` URLs so
 * they survive being written to disk.
 *
 * @param document - The Markdown document to render.
 * @returns A {@link RenderedMarkdownDocument} containing the HTML string,
 *   the cleaned Markdown, the document title, and the parsed PDF/attribute
 *   directives.
 */
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

/**
 * Builds the CSS string to embed in the rendered HTML document.
 *
 * When the document specifies a `:stylesheet:` attribute the contents of
 * that file are appended after the built-in default CSS. If the stylesheet
 * file does not exist the default CSS is returned unchanged.
 *
 * @param attrs - Parsed document attributes, used to read `stylesheet` and
 *   `stylesDir`.
 * @param documentDir - Absolute path to the directory that contains the
 *   source Markdown file, used to resolve relative stylesheet paths.
 * @returns A CSS string ready to embed in a `<style>` tag.
 */
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

/**
 * Returns the absolute base directory used to resolve relative image paths.
 *
 * When the document declares an `:imagesdir:` attribute, that value is
 * resolved relative to the document's own directory. Otherwise the
 * document's directory is used directly.
 *
 * @param document - The source Markdown document.
 * @param attrs - Parsed document attributes, used to read `imagesDir`.
 * @returns Absolute path to the image base directory.
 */
function resolveImageBaseDir(document: vscode.TextDocument, attrs: DevSpecAttributes): string {
	if (!attrs.imagesDir) {
		return path.dirname(document.uri.fsPath);
	}

	return path.resolve(path.dirname(document.uri.fsPath), attrs.imagesDir);
}

/**
 * Extracts the document title from the first ATX level-1 heading (`# …`).
 *
 * Inline Markdown formatting (code spans, bold, italic, links, and HTML
 * tags) is stripped from the captured text before it is returned.
 *
 * @param markdown - The cleaned Markdown source (after directives are
 *   stripped).
 * @returns The plain-text title, or `undefined` when no `# Heading` is
 *   found.
 */
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

/**
 * Reads the `devspecMarkdown.plantumlSecurityProfile` setting and returns
 * the validated value.
 *
 * Any value other than `"UNSECURE"` is treated as `"SECURE"` to prevent
 * accidental security downgrades.
 *
 * @param config - The VS Code workspace configuration object.
 * @returns `"SECURE"` or `"UNSECURE"`.
 */
function getPlantUmlSecurityProfile(
	config: vscode.WorkspaceConfiguration
): "SECURE" | "UNSECURE" {
	const value = config.get<string>("plantumlSecurityProfile") ?? "SECURE";

	if (value === "UNSECURE") {
		return "UNSECURE";
	}

	return "SECURE";
}

/**
 * Walks up the directory tree from the document's location to find the
 * project root.
 *
 * A directory is considered the project root when it contains either:
 * - A `docs/diagrams/src/` subdirectory, or
 * - A `package.json` file alongside a `packages/` directory (monorepo
 *   layout).
 *
 * Falls back to the VS Code workspace folder, or the document's own
 * directory if no workspace is open.
 *
 * @param document - The source Markdown document.
 * @returns Absolute path to the resolved project root.
 */
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

/**
 * Resolves the PlantUML diagram source directory to an absolute path.
 *
 * When the `devspecMarkdown.diagramSourceDir` setting is an absolute path
 * it is used as-is. Relative paths are resolved against `projectRoot`.
 *
 * @param projectRoot - Absolute path to the resolved project root.
 * @param config - The VS Code workspace configuration object.
 * @returns Absolute path to the diagram source directory.
 */
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

/**
 * Locates a Chromium-based browser executable using a layered detection
 * strategy:
 *
 * 1. `devspecMarkdown.browserPath` VS Code setting.
 * 2. `DEVSPEC_BROWSER_PATH`, `PUPPETEER_EXECUTABLE_PATH`, `CHROME_PATH`,
 *    or `EDGE_PATH` environment variables.
 * 3. Hard-coded platform-specific install paths (Edge, Chrome, Brave,
 *    Chromium) via {@link getKnownBrowserPaths}.
 * 4. Windows Registry `App Paths` keys via
 *    {@link findBrowserFromWindowsRegistry}.
 * 5. System `PATH` lookup via {@link findBrowserFromPath}.
 *
 * @param config - Optional VS Code workspace configuration used to read
 *   the `browserPath` setting.
 * @returns Absolute path to the browser executable, or `undefined` when
 *   no browser can be found.
 */
function findBrowserPath(config?: vscode.WorkspaceConfiguration): string | undefined {
	const configuredPath = config?.get<string>("browserPath")?.trim();
	const configuredBrowser = existingFile(configuredPath);

	if (configuredBrowser) {
		return configuredBrowser;
	}

	const envBrowser =
		existingFile(nodeProcess.env.DEVSPEC_BROWSER_PATH) ??
		existingFile(nodeProcess.env.DEVSPEC_CHROME_PATH) ??
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

/**
 * Returns a list of well-known browser executable paths for the current
 * operating system.
 *
 * Covers Microsoft Edge, Google Chrome, Brave Browser, and Chromium on
 * Windows (Program Files, Program Files (x86), ProgramW6432, LocalAppData),
 * macOS (`/Applications` and user `~/Applications`), and common Linux
 * package manager paths (`/usr/bin`, `/snap/bin`).
 *
 * @returns An ordered array of candidate absolute paths to check.
 */
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
			"/usr/bin/google-chrome-stable",
			"/usr/bin/google-chrome",
			"/opt/google/chrome/chrome",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/usr/bin/brave-browser",
			"/snap/bin/chromium"
		);
	}

	return candidates;
}

/**
 * Attempts to locate a browser by querying the Windows Registry `App Paths`
 * keys for `msedge.exe`, `chrome.exe`, and `brave.exe`.
 *
 * Checks both `HKCU` and `HKLM` root keys, as well as the WOW6432 redirect.
 * Each matching `(Default)` REG_SZ value is tested with {@link existingFile}.
 *
 * @returns Absolute path to the browser executable, or `undefined` when
 *   none of the registry queries succeed.
 */
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

/**
 * Parses the output of `reg.exe query … /ve` and extracts the value of the
 * `(Default)` REG_SZ entry.
 *
 * @param output - Raw stdout string from `reg.exe`.
 * @returns The path string from the default registry value, or `undefined`
 *   when the pattern is not found.
 */
function parseDefaultRegistryValue(output: string): string | undefined {
	for (const line of output.split(/\r?\n/)) {
		const match = line.match(/^\s*\(Default\)\s+REG_SZ\s+(.+?)\s*$/i);

		if (match) {
			return match[1].trim();
		}
	}

	return undefined;
}

/**
 * Searches the system `PATH` for a browser executable using `where.exe`
 * (Windows) or `which` (Unix).
 *
 * Tries browser command names in priority order: Edge → Chrome → Brave →
 * Chromium.
 *
 * @returns Absolute path to the first found browser executable, or
 *   `undefined` when none are on PATH.
 */
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

/**
 * Uses `where.exe` (Windows) or `which` (Unix) to find the full path of
 * a command on the system `PATH`.
 *
 * @param command - The executable name to look up (e.g. `"chrome.exe"`).
 * @returns The first matching full path, or `undefined` when the command
 *   is not found.
 */
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

/**
 * Checks whether `value` points to an existing regular file on the
 * file system.
 *
 * Leading/trailing quotes and `~` home-directory expansion are applied
 * before the stat check.
 *
 * @param value - A raw path string (may be `undefined`, quoted, or start
 *   with `~`).
 * @returns The expanded absolute path when it resolves to an existing
 *   file, or `undefined` otherwise.
 */
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

/**
 * Strips a single pair of wrapping double-quotes (`"…"`) or single-quotes
 * (`'…'`) from a string, then trims whitespace.
 *
 * @param value - The raw string value to clean.
 * @returns The unquoted, trimmed string.
 */
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

/**
 * Expands a leading `~` to the current user's home directory.
 *
 * Handles the three cases: bare `~`, Unix-style `~/path`, and
 * Windows-style `~\\path`.
 *
 * @param value - The path string to expand.
 * @returns The path with `~` replaced by `os.homedir()`, or the original
 *   string when it does not start with `~`.
 */
function expandHomePath(value: string): string {
	if (value === "~") {
		return os.homedir();
	}

	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(os.homedir(), value.slice(2));
	}

	return value;
}