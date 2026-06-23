import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import {
	renderMarkdownToHtml,
	parseDevSpecDirectives,
	DEFAULT_DEVSPEC_CSS,
	type DevSpecAttributes
} from "@devspec-markdown/core";

export class DevSpecPreviewPanel {
	private static readonly viewType = "devspecMarkdown.preview";
	private static readonly panels = new Map<string, DevSpecPreviewPanel>();

	private readonly panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;
	private document: vscode.TextDocument;
	private readonly disposables: vscode.Disposable[] = [];

	private initialized = false;
	private updateTimer: ReturnType<typeof setTimeout> | undefined;
	private renderVersion = 0;
	private lastBodyHtml = "";

	public static createOrShow(
		context: vscode.ExtensionContext,
		document: vscode.TextDocument
	): DevSpecPreviewPanel {
		const key = document.uri.toString();
		const existing = DevSpecPreviewPanel.panels.get(key);

		if (existing) {
			existing.panel.reveal(vscode.ViewColumn.Beside);
			existing.scheduleUpdate(document, false);
			return existing;
		}

		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		const localResourceRoots = [context.extensionUri];

		if (workspaceFolder) {
			localResourceRoots.push(workspaceFolder.uri);
		}

		const panel = vscode.window.createWebviewPanel(
			DevSpecPreviewPanel.viewType,
			`DevSpec Preview: ${path.basename(document.uri.fsPath)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots
			}
		);

		const preview = new DevSpecPreviewPanel(context, panel, document);
		DevSpecPreviewPanel.panels.set(key, preview);
		return preview;
	}

	private constructor(
		context: vscode.ExtensionContext,
		panel: vscode.WebviewPanel,
		document: vscode.TextDocument
	) {
		this.context = context;
		this.panel = panel;
		this.document = document;

		// Initial render is allowed to render PlantUML once.
		void this.update(document, true);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		vscode.workspace.onDidChangeTextDocument(
			(event) => {
				if (event.document.uri.toString() === this.document.uri.toString()) {
					this.scheduleUpdate(event.document, false);
				}
			},
			null,
			this.disposables
		);

		vscode.workspace.onDidSaveTextDocument(
			(savedDocument) => {
				if (savedDocument.uri.toString() === this.document.uri.toString()) {
					this.scheduleUpdate(savedDocument, true);
				}
			},
			null,
			this.disposables
		);
	}

	private scheduleUpdate(document: vscode.TextDocument, forcePlantUml: boolean): void {
		this.document = document;

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		const config = vscode.workspace.getConfiguration("devspecMarkdown");
		const debounceMs = config.get<number>("previewDebounceMs") ?? 700;
		const delayMs = forcePlantUml ? 80 : debounceMs;

		this.updateTimer = setTimeout(() => {
			void this.update(document, forcePlantUml);
		}, delayMs);
	}

	public async update(
		document: vscode.TextDocument,
		forcePlantUml = false
	): Promise<void> {
		this.document = document;
		this.panel.title = `DevSpec Preview: ${path.basename(document.uri.fsPath)}`;

		const currentVersion = ++this.renderVersion;

		try {
			const config = vscode.workspace.getConfiguration("devspecMarkdown");
			const projectRoot = resolveProjectRoot(document);
			const diagramSourceDir = resolveDiagramSourceDir(projectRoot, config);

			const parsed = parseDevSpecDirectives(document.getText(), {
				inputFile: document.uri.fsPath
			});
			const documentTitle =
				parsed.pdf.pdfTitle ??
				extractMarkdownTitle(parsed.markdown) ??
				path.basename(document.uri.fsPath);

			const result = renderMarkdownToHtml({
				markdown: parsed.markdown,
				baseDir: projectRoot,
				diagramSourceDir,
				css: buildDocumentCss(parsed.attrs, path.dirname(document.uri.fsPath)),
				viewMode: "preview",
				title: documentTitle,
				tocEnabled: parsed.attrs.toc ?? false,
				tocTitle: parsed.attrs.tocTitle,
				tocMaxLevel: parsed.attrs.tocLevels,
				sourceLanguage: parsed.attrs.sourceLanguage,
				plantuml: {
					jarPath: config.get<string>("plantumlJarPath") ?? "",
					securityProfile: getPlantUmlSecurityProfile(config),
					cwd: path.dirname(document.uri.fsPath),
					force: forcePlantUml,
					skipIfUncached: !forcePlantUml
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

					const imagePath = path.resolve(resolveImageBaseDir(document, parsed.attrs), src);
					return this.panel.webview.asWebviewUri(vscode.Uri.file(imagePath)).toString();
				}
			});

			if (currentVersion !== this.renderVersion) {
				return;
			}

			if (!this.initialized) {
				this.lastBodyHtml = result.bodyHtml;
				this.panel.webview.html = prepareInitialPreviewHtml(
					result.html,
					this.panel.webview,
					result.bodyHtml
				);
				this.initialized = true;
				return;
			}

			if (result.bodyHtml === this.lastBodyHtml) {
				return;
			}

			this.lastBodyHtml = result.bodyHtml;

			await this.panel.webview.postMessage({
				type: "update",
				bodyHtml: result.bodyHtml,
				title: documentTitle
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const errorBody = `<h2>DevSpec Preview Error</h2><pre>${escapeHtml(message)}</pre>`;

			if (!this.initialized) {
				this.panel.webview.html = createErrorHtml(errorBody, this.panel.webview);
				this.initialized = true;
				return;
			}

			await this.panel.webview.postMessage({
				type: "update",
				bodyHtml: errorBody,
				title: "DevSpec Preview Error"
			});
		}
	}

	private dispose(): void {
		DevSpecPreviewPanel.panels.delete(this.document.uri.toString());

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}
}

function prepareInitialPreviewHtml(
	html: string,
	webview: vscode.Webview,
	initialBodyHtml: string
): string {
	const nonce = createNonce();
	const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">`;

	let output = html.replace("<head>", `<head>\n  ${csp}`);

	output = output.replace(
		'<article class="markdown-body devspec-paper">',
		'<article id="devspec-content" class="markdown-body devspec-paper">'
	);

	output = output.replace(
		'<span>Live Preview</span>',
		'<span id="devspec-preview-file-title">Live Preview</span>'
	);

	// The renderer already placed the initial body in the article, but this makes
	// the shell stable even if the template changes later.
	output = output.replace(
		/<article id="devspec-content" class="markdown-body devspec-paper">[\s\S]*?<\/article>/,
		`<article id="devspec-content" class="markdown-body devspec-paper">\n${initialBodyHtml}\n      </article>`
	);

	output = output.replace(
		"</body>",
		`<script nonce="${nonce}">
(function () {
  const content = document.getElementById("devspec-content");
  const fileTitle = document.getElementById("devspec-preview-file-title");

  window.addEventListener("message", function (event) {
    const message = event.data;

    if (!message || message.type !== "update" || !content) {
      return;
    }

    const maxScrollBefore = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scrollRatio = document.documentElement.scrollTop / maxScrollBefore;

    content.innerHTML = message.bodyHtml || "";

    if (fileTitle && message.title) {
      fileTitle.textContent = message.title;
    }

    requestAnimationFrame(function () {
      const maxScrollAfter = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      document.documentElement.scrollTop = scrollRatio * maxScrollAfter;
    });
  });
}());
</script>
</body>`
	);

	return output;
}

function createErrorHtml(errorBody: string, webview: vscode.Webview): string {
	const nonce = createNonce();
	const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">`;

	return `<!doctype html>
<html>
<head>
  ${csp}
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; padding: 24px; }
    pre { white-space: pre-wrap; background: #f6f8fa; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px; }
  </style>
</head>
<body>
  <article id="devspec-content">${errorBody}</article>
  <script nonce="${nonce}">
    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "update") {
        document.getElementById("devspec-content").innerHTML = event.data.bodyHtml || "";
      }
    });
  </script>
</body>
</html>`;
}

function resolveProjectRoot(document: vscode.TextDocument): string {
	let currentDir = path.dirname(document.uri.fsPath);

	while (true) {
		if (fs.existsSync(path.join(currentDir, "docs", "diagrams", "src"))) {
			return currentDir;
		}

		if (fs.existsSync(path.join(currentDir, "package.json")) && fs.existsSync(path.join(currentDir, "packages"))) {
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
	const rawDiagramSourceDir = config.get<string>("diagramSourceDir") ?? "docs/diagrams/src";
	return path.isAbsolute(rawDiagramSourceDir)
		? rawDiagramSourceDir
		: path.resolve(projectRoot, rawDiagramSourceDir);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function createNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let value = "";

	for (let i = 0; i < 32; i += 1) {
		value += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return value;
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
