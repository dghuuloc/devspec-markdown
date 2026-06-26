import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import {
	renderMarkdownToHtml,
	parseDevSpecDirectives,
	DEFAULT_DEVSPEC_CSS,
	type DevSpecAttributes
} from "@devspec-markdown/core";

/**
 * Manages a VS Code {@link vscode.WebviewPanel} that renders a live
 * DevSpec Markdown preview for a single Markdown document.
 *
 * At most one `DevSpecPreviewPanel` exists per document URI. The static
 * {@link DevSpecPreviewPanel.panels} map enforces this invariant.
 *
 * ### Update strategy
 * - **Initial render** — the full HTML page (shell + CSS + body) is set
 *   via `webview.html`. A lightweight client-side script is injected to
 *   handle subsequent incremental updates.
 * - **Incremental updates** — only the body HTML fragment is re-rendered
 *   and posted to the webview via `postMessage`. If the body is unchanged,
 *   no message is sent (no-op diff).
 * - **Debouncing** — text-change events are debounced using
 *   `devspecMarkdown.previewDebounceMs` (default 700 ms). Save events use
 *   an 80 ms delay so PlantUML diagrams re-render quickly after save.
 * - **Race-condition guard** — `renderVersion` is incremented before each
 *   async render; stale results are discarded silently.
 */
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

	private suppressEditorScrollUntil = 0;
	private suppressPreviewScrollUntil = 0;
	private lastEditorSyncLine = -1;
	private lastPreviewSyncLine = -1;

	private previewZoom = 1;
	private static activePanel: DevSpecPreviewPanel | undefined;
	private static readonly minPreviewZoom = 0.5;
	private static readonly maxPreviewZoom = 3;
	private static readonly previewZoomStep = 0.1;

	/**
	 * Creates a new {@link DevSpecPreviewPanel} for `document`, or reveals
	 * the existing one if it is already open.
	 *
	 * The webview is placed in the column beside the active editor
	 * (`vscode.ViewColumn.Beside`). Local resource roots are set to the
	 * extension URI and the workspace folder so that images resolve
	 * correctly via `webview.asWebviewUri`.
	 *
	 * @param context - The extension context, used to obtain the extension
	 *   URI and to create the webview panel.
	 * @param document - The Markdown document to preview.
	 * @returns The newly created or existing `DevSpecPreviewPanel` instance.
	 */
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

		const config = vscode.workspace.getConfiguration("devspecMarkdown");
		this.previewZoom = clampPreviewZoom(config.get<number>("previewZoomLevel") ?? 1);
		DevSpecPreviewPanel.activePanel = this;

		// Initial render is allowed to render PlantUML once.
		void this.update(document, true);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.onDidChangeViewState(
			(event) => {
				if (event.webviewPanel.active || event.webviewPanel.visible) {
					DevSpecPreviewPanel.activePanel = this;
				}
			},
			null,
			this.disposables
		);

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

		vscode.window.onDidChangeTextEditorVisibleRanges(
			(event) => {
				if (event.textEditor.document.uri.toString() !== this.document.uri.toString()) {
					return;
				}

				if (Date.now() < this.suppressEditorScrollUntil) {
					return;
				}

				this.syncPreviewToEditor(event.textEditor);
			},
			null,
			this.disposables
		);

		this.panel.webview.onDidReceiveMessage(
			(message) => {
				if (!message || typeof message.type !== "string") {
					return;
				}

				if (message.type === "previewZoomIn") {
					this.zoomIn();
					return;
				}

				if (message.type === "previewZoomOut") {
					this.zoomOut();
					return;
				}

				if (message.type === "previewZoomReset") {
					this.resetZoom();
					return;
				}

				if (message.type === "previewZoomSet") {
					const zoom = Number(message.zoom);

					if (Number.isFinite(zoom)) {
						this.setPreviewZoom(zoom);
					}

					return;
				}

				if (message.type !== "previewDidScroll") {
					return;
				}

				if (Date.now() < this.suppressPreviewScrollUntil) {
					return;
				}

				const line = Number(message.line);

				if (!Number.isFinite(line) || line < 1) {
					return;
				}

				this.syncEditorToPreview(line);
			},
			null,
			this.disposables
		);

	}

	/**
	 * Schedules a debounced call to {@link DevSpecPreviewPanel.update}.
	 *
	 * Any in-flight timer is cleared before setting a new one:
	 * - `forcePlantUml = true` (after save): 80 ms delay so diagrams
	 *   re-render quickly.
	 * - `forcePlantUml = false` (during typing): delay from
	 *   `devspecMarkdown.previewDebounceMs` (default 700 ms) to avoid
	 *   re-rendering on every keystroke.
	 *
	 * @param document - The current document state.
	 * @param forcePlantUml - When `true` the render pass will re-invoke
	 *   PlantUML even for diagrams that are already cached.
	 */
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

	/**
	 * Performs a full render of `document` and updates the webview.
	 *
	 * On the **first call** the complete HTML page is written to
	 * `webview.html` (initial load). On **subsequent calls** only the body
	 * HTML fragment is posted via `postMessage`, which the injected client
	 * script patches into the DOM while preserving the scroll position.
	 *
	 * If the rendered `bodyHtml` is identical to the previous render,
	 * the method returns early without sending any message.
	 *
	 * A stale render (when `renderVersion` has advanced since this call
	 * began) is discarded silently to avoid overwriting a newer result.
	 *
	 * @param document - The document to render.
	 * @param forcePlantUml - When `true`, PlantUML diagrams are always
	 *   re-rendered even if a cached SVG exists. Set to `true` after a
	 *   document save; `false` during live typing.
	 */
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
					result.bodyHtml,
					this.previewZoom
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

	private syncPreviewToEditor(editor: vscode.TextEditor): void {
		const config = vscode.workspace.getConfiguration("devspecMarkdown");
		const enabled = config.get<boolean>("previewScrollSync") ?? true;

		if (!enabled) {
			return;
		}

		const visibleRange = editor.visibleRanges[0];

		if (!visibleRange) {
			return;
		}

		const line = visibleRange.start.line + 1;

		if (line === this.lastEditorSyncLine) {
			return;
		}

		this.lastEditorSyncLine = line;
		this.suppressPreviewScrollUntil = Date.now() + 250;

		void this.panel.webview.postMessage({
			type: "scrollToLine",
			line
		});
	}

	private syncEditorToPreview(line: number): void {
		const config = vscode.workspace.getConfiguration("devspecMarkdown");
		const enabled = config.get<boolean>("previewScrollSync") ?? true;

		if (!enabled) {
			return;
		}

		const editor = vscode.window.visibleTextEditors.find(
			(candidate) => candidate.document.uri.toString() === this.document.uri.toString()
		);

		if (!editor) {
			return;
		}

		const targetLine = Math.max(0, Math.min(editor.document.lineCount - 1, line - 1));

		if (targetLine === this.lastPreviewSyncLine) {
			return;
		}

		this.lastPreviewSyncLine = targetLine;
		this.suppressEditorScrollUntil = Date.now() + 250;

		const range = new vscode.Range(targetLine, 0, targetLine, 0);

		editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
	}

	public static zoomActivePreviewIn(): void {
		const panel = DevSpecPreviewPanel.activePanel;

		if (!panel) {
			vscode.window.showWarningMessage("Open a DevSpec preview first.");
			return;
		}

		panel.zoomIn();
	}

	public static zoomActivePreviewOut(): void {
		const panel = DevSpecPreviewPanel.activePanel;

		if (!panel) {
			vscode.window.showWarningMessage("Open a DevSpec preview first.");
			return;
		}

		panel.zoomOut();
	}

	public static resetActivePreviewZoom(): void {
		const panel = DevSpecPreviewPanel.activePanel;

		if (!panel) {
			vscode.window.showWarningMessage("Open a DevSpec preview first.");
			return;
		}

		panel.resetZoom();
	}

	private zoomIn(): void {
		this.setPreviewZoom(this.previewZoom + DevSpecPreviewPanel.previewZoomStep);
	}

	private zoomOut(): void {
		this.setPreviewZoom(this.previewZoom - DevSpecPreviewPanel.previewZoomStep);
	}

	private resetZoom(): void {
		this.setPreviewZoom(1);
	}

	private setPreviewZoom(value: number): void {
		this.previewZoom = clampPreviewZoom(value);

		void this.panel.webview.postMessage({
			type: "setZoom",
			zoom: this.previewZoom
		});
	}

	/**
	 * Cleans up the panel instance:
	 * - Removes this panel from the static {@link DevSpecPreviewPanel.panels} map.
	 * - Cancels any pending debounce timer.
	 * - Disposes all VS Code {@link vscode.Disposable}s (event listeners).
	 *
	 * Called automatically when the webview panel fires `onDidDispose`.
	 */
	private dispose(): void {
		if (DevSpecPreviewPanel.activePanel === this) {
			DevSpecPreviewPanel.activePanel = undefined;
		}

		DevSpecPreviewPanel.panels.delete(this.document.uri.toString());

		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}

		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}
}

/**
 * Transforms the full HTML string produced by `renderMarkdownToHtml` into
 * a webview-compatible document.
 *
 * The following modifications are applied:
 * 1. A Content Security Policy `<meta>` tag is prepended to `<head>`,
 *    restricting scripts to those with the generated nonce.
 * 2. The `<article>` element is given the stable `id="devspec-content"`
 *    so the client script can locate it by ID.
 * 3. The preview file-title `<span>` is given the stable
 *    `id="devspec-preview-file-title"` so it can be updated by the client
 *    script.
 * 4. A nonce-gated `<script>` block is appended before `</body>` that
 *    listens for `postMessage` events of type `"update"` and patches the
 *    article `innerHTML` in-place, restoring the scroll position by ratio.
 *
 * @param html - The complete HTML string from the core renderer.
 * @param webview - The webview instance, used for CSP source and nonce.
 * @param initialBodyHtml - The initial body HTML fragment already embedded
 *   in `html`; also written to `lastBodyHtml` for future diff checks.
 * @returns The transformed HTML string ready to assign to `webview.html`.
 */
function prepareInitialPreviewHtml(
	html: string,
	webview: vscode.Webview,
	initialBodyHtml: string,
	initialZoom: number
): string {
	const nonce = createNonce();
	const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">`;

	let output = html.replace("<head>", `<head>\n  ${csp}`);

	output = output.replace(
		"</head>",
		`<style>
			body {
				overflow-x: auto;
			}

			#devspec-preview-page-viewport {
				box-sizing: border-box;
				width: 100%;
				overflow: visible;
			}

			#devspec-preview-page-wrapper {
				box-sizing: border-box;
				width: fit-content;
				min-width: 100%;
				margin: 0 auto;
				transform: none !important;
			}

			.markdown-body .plantuml-diagram,
			.markdown-body .mermaid-diagram,
			.markdown-body .diagram-block,
			.markdown-body figure.diagram-block {
				overflow: auto !important;
			}

			.markdown-body .devspec-diagram-zoomed {
				text-align: left !important;
			}

			.markdown-body .devspec-diagram-zoomed img,
			.markdown-body .devspec-diagram-zoomed svg {
				max-width: none !important;
				margin-left: 0 !important;
				margin-right: 0 !important;
			}

			.markdown-body .plantuml-diagram:hover,
			.markdown-body .mermaid-diagram:hover,
			.markdown-body .diagram-block:hover,
			.markdown-body figure.diagram-block:hover {
				outline: 1px dashed rgba(37, 99, 235, 0.45);
				outline-offset: 4px;
			}
		</style>
		</head>`
	);

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
		`<div id="devspec-preview-page-viewport">
		<div id="devspec-preview-page-wrapper">
		<article id="devspec-content" class="markdown-body devspec-paper">
			${initialBodyHtml}
		</article>
		</div>
		</div>`
	);

	output = output.replace(
		"</body>",
		`<div class="devspec-preview-zoom-toolbar" aria-label="Preview zoom controls">
			<button id="devspec-preview-zoom-out" title="Zoom out">−</button>
			<button id="devspec-preview-zoom-reset" title="Reset zoom">100%</button>
			<button id="devspec-preview-zoom-in" title="Zoom in">+</button>
		</div>

		<script nonce="${nonce}">
		(function () {
			const vscode = acquireVsCodeApi();
			const content = document.getElementById("devspec-content");
			const pageWrapper = document.getElementById("devspec-preview-page-wrapper");
			const fileTitle = document.getElementById("devspec-preview-file-title");

			let programmaticScroll = false;
			let scrollTimer = 0;
			let zoom = clampZoom(${JSON.stringify(clampPreviewZoom(initialZoom))});
			let pageZoom = 1;
			let lastWheelZoomAt = 0;
			let pendingZoomAnchor = null;
			let pendingPageZoomAnchor = null;

			function clampZoom(value) {
				const numeric = Number(value);

				if (!Number.isFinite(numeric)) {
				return 1;
				}

				return Math.min(3, Math.max(0.5, Math.round(numeric * 10) / 10));
			}

			function saveZoomState() {
				vscode.setState({
					zoom: zoom,
					pageZoom: pageZoom
				});
			}

			function restoreScrollAroundAnchor(anchor, oldValue, newValue) {
				if (!anchor || oldValue <= 0) {
					return;
				}

				const scale = newValue / oldValue;

				requestAnimationFrame(function () {
					window.scrollTo({
						left: anchor.scrollX * scale + anchor.clientX * (scale - 1),
						top: anchor.scrollY * scale + anchor.clientY * (scale - 1),
						behavior: "auto"
					});
				});
			}

			function applyZoom(value) {
				const oldZoom = zoom;
				const anchor = pendingZoomAnchor;

				zoom = clampZoom(value);

				if (content) {
					content.style.zoom = String(zoom);
				}

				saveZoomState();

				restoreScrollAroundAnchor(anchor, oldZoom, zoom);
				pendingZoomAnchor = null;
			}

			function applyPageZoom(value) {
				const oldPageZoom = pageZoom;
				const anchor = pendingPageZoomAnchor;

				pageZoom = clampZoom(value);

				if (pageWrapper) {
					pageWrapper.style.zoom = String(pageZoom);
				}

				saveZoomState();

				restoreScrollAroundAnchor(anchor, oldPageZoom, pageZoom);
				pendingPageZoomAnchor = null;
			}

			function getScrollTop() {
				return document.documentElement.scrollTop || document.body.scrollTop || 0;
			}

			function getSourceElements() {
				if (!content) {
				return [];
				}

				return Array.from(content.querySelectorAll("[data-source-line]"));
			}

			function findElementForLine(line) {
				const elements = getSourceElements();

				if (elements.length === 0) {
				return null;
				}

				let best = elements[0];

				for (const element of elements) {
				const currentLine = Number(element.getAttribute("data-source-line"));

				if (!Number.isFinite(currentLine)) {
					continue;
				}

				if (currentLine <= line) {
					best = element;
				} else {
					break;
				}
				}

				return best;
			}

			function findCurrentSourceLine() {
				const elements = getSourceElements();

				if (elements.length === 0) {
				return 1;
				}

				const top = getScrollTop();
				let bestLine = 1;
				let bestDistance = Number.POSITIVE_INFINITY;

				for (const element of elements) {
				const rect = element.getBoundingClientRect();
				const absoluteTop = rect.top + top;
				const distance = Math.abs(absoluteTop - top - 24);

				if (distance < bestDistance) {
					const line = Number(element.getAttribute("data-source-line"));

					if (Number.isFinite(line)) {
					bestLine = line;
					bestDistance = distance;
					}
				}
				}

				return bestLine;
			}

			function scrollToSourceLine(line) {
				const element = findElementForLine(Number(line));

				if (!element) {
				return;
				}

				programmaticScroll = true;

				const top = element.getBoundingClientRect().top + getScrollTop() - 16;

				window.scrollTo({
				top,
				behavior: "auto"
				});

				window.setTimeout(function () {
				programmaticScroll = false;
				}, 250);
			}

			function findZoomableDiagram(target) {
				if (!(target instanceof Element)) {
					return null;
				}

				const diagram = target.closest(
					".plantuml-diagram, .mermaid-diagram, .diagram-block, figure.diagram-block"
				);

				if (!diagram) {
					return null;
				}

				const graphic = diagram.querySelector("img.plantuml-svg-image, svg, img");

				if (!graphic) {
					return null;
				}

				return diagram;
			}

			function getDiagramGraphic(diagram) {
				return diagram.querySelector("img.plantuml-svg-image, svg, img");
			}

			function getDiagramZoom(diagram) {
				const value = Number(diagram.getAttribute("data-devspec-diagram-zoom"));

				if (!Number.isFinite(value) || value <= 0) {
					return 1;
				}

				return value;
			}

			function getDiagramBaseWidth(graphic) {
				const saved = Number(graphic.getAttribute("data-devspec-base-width"));

				if (Number.isFinite(saved) && saved > 0) {
					return saved;
				}

				const rect = graphic.getBoundingClientRect();
				const baseWidth = Math.max(1, rect.width);

				graphic.setAttribute("data-devspec-base-width", String(baseWidth));

				return baseWidth;
			}

			function applyDiagramZoom(diagram, value) {
				const graphic = getDiagramGraphic(diagram);

				if (!graphic) {
					return;
				}

				const nextZoom = clampZoom(value);
				const baseWidth = getDiagramBaseWidth(graphic);

				diagram.classList.add("devspec-diagram-zoomed");
				diagram.setAttribute("data-devspec-diagram-zoom", String(nextZoom));

				graphic.style.maxWidth = "none";
				graphic.style.width = Math.round(baseWidth * nextZoom) + "px";
				graphic.style.height = "auto";

				if (nextZoom === 1) {
					diagram.classList.remove("devspec-diagram-zoomed");
					graphic.style.maxWidth = "";
					graphic.style.width = "";
					graphic.style.height = "";
				}
			}

			window.addEventListener("keydown", function (event) {
				const isZoomShortcut = event.ctrlKey || event.metaKey;

				if (!isZoomShortcut) {
					return;
				}

				if (event.key === "+" || event.key === "=") {
					event.preventDefault();
					vscode.postMessage({ type: "previewZoomIn" });
					return;
				}

				if (event.key === "-") {
					event.preventDefault();
					vscode.postMessage({ type: "previewZoomOut" });
					return;
				}

				if (event.key === "0") {
					event.preventDefault();

					if (event.altKey) {
						applyPageZoom(1);
						return;
					}

					vscode.postMessage({ type: "previewZoomReset" });
				}
			});

			window.addEventListener("wheel", function (event) {
				const isCtrlZoomGesture = event.ctrlKey || event.metaKey;

				if (!isCtrlZoomGesture) {
					return;
				}

				event.preventDefault();

				const now = Date.now();

				if (now - lastWheelZoomAt < 45) {
					return;
				}

				lastWheelZoomAt = now;

				const direction = event.deltaY < 0 ? 1 : -1;

				// Ctrl + Alt + mouse wheel:
				// zoom the whole preview page wrapper like a PDF viewer.
				if (event.altKey) {
					const nextPageZoom = clampZoom(pageZoom + direction * 0.1);

					if (nextPageZoom === pageZoom) {
						return;
					}

					pendingPageZoomAnchor = {
						clientX: event.clientX,
						clientY: event.clientY,
						scrollX: window.scrollX || document.documentElement.scrollLeft || 0,
						scrollY: getScrollTop(),
						oldZoom: pageZoom
					};

					applyPageZoom(nextPageZoom);
					return;
				}

				// Ctrl + mouse wheel over diagram:
				// zoom only the diagram.
				const diagram = findZoomableDiagram(event.target);

				if (diagram) {
					const currentDiagramZoom = getDiagramZoom(diagram);
					const nextDiagramZoom = clampZoom(currentDiagramZoom + direction * 0.1);

					applyDiagramZoom(diagram, nextDiagramZoom);
					return;
				}

				// Ctrl + mouse wheel over normal preview content:
				// zoom Markdown content.
				const nextZoom = clampZoom(zoom + direction * 0.1);

				if (nextZoom === zoom) {
					return;
				}

				pendingZoomAnchor = {
					clientX: event.clientX,
					clientY: event.clientY,
					scrollX: window.scrollX || document.documentElement.scrollLeft || 0,
					scrollY: getScrollTop(),
					oldZoom: zoom
				};

				vscode.postMessage({
					type: "previewZoomSet",
					zoom: nextZoom
				});
			}, { passive: false });

			window.addEventListener("message", function (event) {
				const message = event.data;

				if (!message) {
					return;
				}

				if (message.type === "setZoom") {
					applyZoom(message.zoom);
					return;
				}

				if (message.type === "scrollToLine") {
					scrollToSourceLine(message.line);
					return;
				}

				if (message.type !== "update" || !content) {
					return;
				}

				const maxScrollBefore = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
				const scrollRatio = getScrollTop() / maxScrollBefore;

				content.innerHTML = message.bodyHtml || "";
				applyZoom(zoom);

				if (fileTitle && message.title) {
					fileTitle.textContent = message.title;
				}

				requestAnimationFrame(function () {
					const maxScrollAfter = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
					window.scrollTo(0, scrollRatio * maxScrollAfter);
				});
			});

			window.addEventListener("scroll", function () {
				if (programmaticScroll) {
					return;
				}

				window.clearTimeout(scrollTimer);

				scrollTimer = window.setTimeout(function () {
				vscode.postMessage({
					type: "previewDidScroll",
					line: findCurrentSourceLine()
				});
				}, 80);
			}, { passive: true });

			const restoredState = vscode.getState();

			if (restoredState && typeof restoredState.zoom === "number") {
				applyZoom(restoredState.zoom);
			} else {
				applyZoom(zoom);
			}

			if (restoredState && typeof restoredState.pageZoom === "number") {
				applyPageZoom(restoredState.pageZoom);
			} else {
				applyPageZoom(pageZoom);
			}
			}());
		</script>
		</body>`
	);

	return output;
}

/**
 * Creates a minimal error-display HTML page for the webview.
 *
 * The page still includes the client-side `postMessage` listener so it can
 * be replaced by a successful render without reloading the webview.
 *
 * @param errorBody - An HTML fragment containing the error message,
 *   typically an `<h2>` and a `<pre>` with the stack or message text.
 * @param webview - The webview instance, used for CSP source and nonce.
 * @returns A complete HTML string ready to assign to `webview.html`.
 */
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

function clampPreviewZoom(value: number): number {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return Math.min(3, Math.max(0.5, Math.round(value * 10) / 10));
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
