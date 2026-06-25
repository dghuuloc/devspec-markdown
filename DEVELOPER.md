# DevSpec Markdown — Developer Documentation

This document describes the internal architecture, package structure, data flow, and contribution guide for the **DevSpec Markdown** monorepo.

---

## Table of Contents

- [Repository Layout](#repository-layout)
- [Package Overview](#package-overview)
  - [core](#packagescorepackagejson)
  - [cli](#packagesclipackagejson)
  - [vscode-extension](#packagesvscode-extension)
- [VS Code Extension Architecture](#vs-code-extension-architecture)
  - [extension.ts — Entry Point](#extensionts--entry-point)
  - [previewPanel.ts — Live Preview](#previewpanelts--live-preview)
  - [markdownItPlugin.ts — Built-in Preview Integration](#markdownitplugintsbuilt-in-preview-integration)
- [Core Rendering Pipeline](#core-rendering-pipeline)
- [DevSpec Document Attributes](#devspec-document-attributes)
- [PDF Export Pipeline](#pdf-export-pipeline)
- [Extension Settings Reference](#extension-settings-reference)
- [Development Setup](#development-setup)
- [Building and Packaging](#building-and-packaging)
- [Architecture Decision Notes](#architecture-decision-notes)

---

## Repository Layout

```
devspec-markdown/
├─ packages/
│  ├─ core/                        Shared rendering engine (library)
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts               Public API re-exports
│  │     ├─ devspec-directives.ts  Document attribute parser & include expander
│  │     ├─ markdown-to-html.ts    Markdown → HTML renderer
│  │     ├─ plantuml-renderer.ts   PlantUML → SVG via plantuml.jar
│  │     ├─ section-numbering.ts   Heading numbering logic
│  │     ├─ pdf-exporter.ts        HTML → PDF via Puppeteer / Pagedjs-CLI
│  │     ├─ default-style.ts       Embedded default CSS stylesheet
│  │     ├─ process-documents.ts   Batch document processor (CLI helper)
│  │     └─ types.d.ts             Shared type declarations
│  │
│  ├─ cli/                         Command-line interface
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     └─ devspec-cli.ts         CLI entry (build / pdf / watch commands)
│  │
│  └─ vscode-extension/            VS Code extension
│     ├─ package.json              Extension manifest (commands, settings, menus)
│     ├─ tsconfig.json
│     ├─ CHANGELOG.md
│     ├─ README.md                 Marketplace user guide
│     └─ src/
│        ├─ extension.ts           Activation, command handlers
│        ├─ previewPanel.ts        Webview live preview panel
│        └─ markdownItPlugin.ts    markdown-it plugin for built-in VS Code preview
│
├─ docs/
│  ├─ config/
│  │  └─ devspec-properties.md     Example shared attribute configuration
│  ├─ diagrams/src/                PlantUML source diagrams
│  └─ templates/                   Sample DevSpec Markdown documents
│
├─ scripts/
│  ├─ clean.mjs                    Removes build artifacts
│  ├─ download-plantuml.mjs        Downloads plantuml.jar into core/vendor/
│  └─ prepare-vsix.mjs             Prepares the VSIX package directory
│
└─ package.json                    Monorepo root (npm workspaces)
```

---

## Package Overview

### `packages/core`

The shared, framework-agnostic rendering library. Both the CLI and the VS Code extension depend on this package.

| Module | Responsibility |
|---|---|
| `devspec-directives.ts` | Parses AsciiDoc-style `:key: value` attributes and `include::` directives from Markdown front matter. Produces `ParsedDevSpecDocument` (cleaned markdown + `DevSpecPdfDirectives` + `DevSpecAttributes`). |
| `markdown-to-html.ts` | Converts parsed Markdown to a complete HTML document using **markdown-it** with a suite of plugins. Handles PlantUML fences, syntax highlighting, section numbering, TOC injection, and alert blocks. |
| `plantuml-renderer.ts` | Invokes `plantuml.jar` via `java -jar` as a child process to render `.puml` source or embedded PlantUML fences into inline SVG. Results are cached in memory. |
| `section-numbering.ts` | Computes hierarchical section numbers (e.g. `2.3.1`) for headings within a configurable level range. |
| `pdf-exporter.ts` | Uses Puppeteer (launched against a user-supplied Chromium browser) to print a temporary HTML file to PDF. Supports custom headers, footers, and page numbers via Pagedjs-CLI. |
| `default-style.ts` | Contains the complete default CSS string (GitHub-like, with paper layout, code block styles, and alert variants). |
| `process-documents.ts` | Batch helper used by the CLI to process multiple input files. |
| `index.ts` | Public barrel file re-exporting the entire API surface. |

### `packages/cli`

Thin command-line wrapper around `@devspec-markdown/core`. Provides:

- `devspec build --input <file> --output <file>` — renders Markdown to HTML.
- `devspec pdf --input <file> --output <file> --browser <path>` — renders HTML to PDF.

### `packages/vscode-extension`

The VS Code extension. Described in detail in the next section.

---

## VS Code Extension Architecture

The extension is composed of three TypeScript source files. They share no module-level state between them; all state is managed either through VS Code's `ExtensionContext` or through the `DevSpecPreviewPanel` static map.

```
┌──────────────────────────────────────────────────┐
│  VS Code Extension Host                          │
│                                                  │
│  extension.ts          (command handlers)        │
│       │                                          │
│       ├── DevSpecPreviewPanel.createOrShow()     │
│       │       └── previewPanel.ts  (webview)     │
│       │                                          │
│       └── renderCurrentMarkdownToHtml()          │
│               └── @devspec-markdown/core         │
│                                                  │
│  markdownItPlugin.ts   (built-in preview plugin) │
└──────────────────────────────────────────────────┘
```

### `extension.ts` — Entry Point

**Exported API**

| Symbol | Description |
|---|---|
| `activate(context)` | Called by VS Code when any of the three `activationEvents` fire. Registers the three commands and their handlers. |
| `deactivate()` | Called on extension unload. No cleanup is needed because all disposables are registered via `context.subscriptions`. |

**Command: `devspecMarkdown.openPreview`**

1. Retrieves the active Markdown editor via `getActiveMarkdownDocument()`.
2. Delegates to `DevSpecPreviewPanel.createOrShow()` to create or re-focus the webview panel for that document.

**Command: `devspecMarkdown.exportHtml`**

1. Retrieves the active Markdown editor.
2. Calls `renderCurrentMarkdownToHtml()` to produce a full HTML string.
3. Writes it to `<filename>.devspec.html` next to the source file.

**Command: `devspecMarkdown.exportPdf`**

1. Retrieves the active Markdown editor.
2. Calls `findBrowserPath()` to locate a Chromium-based browser.
3. Shows a Save dialog defaulting to `<filename>.devspec.pdf`.
4. Renders HTML to a temporary `.devspec.tmp.html` file.
5. Passes it to `exportHtmlFileToPdf()` from `@devspec-markdown/core` with all PDF header/footer directives.
6. Cleans up the temporary file in the `finally` block.

**Key Internal Functions**

| Function | Description |
|---|---|
| `getActiveMarkdownDocument()` | Returns the active editor's document if its language is `markdown` or the file extension is `.md`; otherwise `undefined`. |
| `renderCurrentMarkdownToHtml(document)` | Central pipeline: reads VS Code settings, calls `parseDevSpecDirectives()`, then `renderMarkdownToHtml()`. Returns an object containing `html`, `markdown`, `title`, `pdf` directives, and `attrs`. |
| `buildDocumentCss(attrs, documentDir)` | Returns the default CSS, optionally concatenated with the content of a user-specified custom stylesheet. |
| `resolveImageBaseDir(document, attrs)` | Determines the base directory for resolving relative image paths, honouring the `:imagesdir:` attribute. |
| `extractMarkdownTitle(markdown)` | Extracts the first ATX `# Heading` from the document and strips inline markup from it. |
| `resolveProjectRoot(document)` | Walks up the directory tree from the document's location, looking for a `docs/diagrams/src/` directory or a `package.json` + `packages/` pair. Falls back to the VS Code workspace root. |
| `resolveDiagramSourceDir(projectRoot, config)` | Resolves the `devspecMarkdown.diagramSourceDir` setting to an absolute path. |
| `findBrowserPath(config?)` | Performs a multi-strategy browser lookup: VS Code setting → environment variables → known platform paths → Windows Registry → system PATH. |
| `getKnownBrowserPaths()` | Returns OS-specific hard-coded paths for Edge, Chrome, Brave, and Chromium. |
| `findBrowserFromWindowsRegistry()` | Queries `HKCU`/`HKLM` App Paths registry keys via `reg.exe`. |
| `findBrowserFromPath()` | Probes browser executables using `where.exe` (Windows) or `which` (Unix). |
| `getPlantUmlSecurityProfile(config)` | Returns `"SECURE"` or `"UNSECURE"` from the VS Code setting, defaulting to `"SECURE"`. |

---

### `previewPanel.ts` — Live Preview

The `DevSpecPreviewPanel` class manages one VS Code **webview panel** per Markdown document. The static `panels` map (keyed by document URI string) enforces a single panel per file.

**Lifecycle**

```
createOrShow()
    │
    ├─ (existing panel found) → reveal + scheduleUpdate()
    │
    └─ (new panel) → createWebviewPanel() → new DevSpecPreviewPanel()
                                                │
                                                ├─ update() [initial, full render]
                                                ├─ onDidChangeTextDocument → scheduleUpdate()
                                                └─ onDidSaveTextDocument  → scheduleUpdate(forcePlantUml=true)
```

**Rendering Strategy**

The preview uses a **two-phase update** model to minimise flicker:

1. **Initial load** — `update()` renders the full HTML page including the document shell, CSS, and body content. The HTML is set via `panel.webview.html`. A small script is injected that listens for `postMessage` events.
2. **Incremental updates** — Subsequent calls to `update()` render only the body HTML (`result.bodyHtml`). If it is unchanged from `lastBodyHtml`, no message is sent. Otherwise, a `{ type: "update", bodyHtml, title }` message is posted to the webview. The injected script updates `innerHTML` in place, preserving the user's scroll position by ratio.

**Debouncing**

`scheduleUpdate()` uses `setTimeout` to debounce updates:
- For **PlantUML-forced** renders (after save): 80 ms delay, so diagrams re-render quickly.
- For **typing** (text change): uses the `devspecMarkdown.previewDebounceMs` setting (default 700 ms) to avoid re-rendering on every keystroke.

**Race condition guard**

`renderVersion` is an incrementing integer. Each call to `update()` captures the current version before any async work. If the version has advanced when the async render finishes, the stale result is silently discarded.

**Key Methods**

| Method | Description |
|---|---|
| `createOrShow(context, document)` | Static factory. Creates a new panel or reveals an existing one for the given document. |
| `update(document, forcePlantUml)` | Async. Performs a full render and either sets `webview.html` (initial) or posts a partial update message. |
| `scheduleUpdate(document, forcePlantUml)` | Debounced entry point called by document-change listeners. |
| `dispose()` | Removes the panel from the static map, clears the timer, and disposes all VS Code `Disposable`s. |

**Helper Functions (module-level)**

| Function | Description |
|---|---|
| `prepareInitialPreviewHtml(html, webview, initialBodyHtml)` | Injects a Content Security Policy `<meta>` tag, assigns the `devspec-content` element ID, and appends the client-side message-listener script. |
| `createErrorHtml(errorBody, webview)` | Returns a minimal error-display HTML page that still listens for `postMessage` updates. |
| `resolveProjectRoot(document)` | Same logic as in `extension.ts`; duplicated so `previewPanel.ts` is independently usable. |
| `resolveDiagramSourceDir(projectRoot, config)` | Same logic as in `extension.ts`. |
| `buildDocumentCss(attrs, documentDir)` | Same logic as in `extension.ts`. |
| `resolveImageBaseDir(document, attrs)` | Same logic as in `extension.ts`. |
| `extractMarkdownTitle(markdown)` | Same logic as in `extension.ts`. |
| `getPlantUmlSecurityProfile(config)` | Same logic as in `extension.ts`. |

> **Note on duplication:** The helper functions above are intentionally duplicated between `extension.ts` and `previewPanel.ts` rather than extracted to a shared utility module, keeping each file self-contained and avoiding an extra internal module boundary.

---

### `markdownItPlugin.ts` — Built-in Preview Integration

This module exports a single function `extendMarkdownIt(md)` that VS Code calls when loading the extension as a [markdown-it](https://github.com/markdown-it/markdown-it) plugin. It enhances VS Code's **built-in Markdown preview** (not the custom DevSpec preview panel) with:

- **PlantUML fences** — Replaces `plantuml`/`puml` fenced blocks with an SVG placeholder image generated locally.
- **Section numbering** — Collects headings during the `core` rule pipeline pass and prepends computed section numbers.
- **Table of contents** — Detects a `[toc]` or `:toc:` placeholder token and replaces it with a generated `<nav>` list.

**Why two previews?**

| Preview | How it works | When to use |
|---|---|---|
| DevSpec Preview (`openPreview` command) | Custom webview + full `@devspec-markdown/core` render | All DevSpec features (headers/footers, custom CSS, PDF directives) |
| VS Code built-in preview | markdown-it plugin (`markdownItPlugin.ts`) | Fast, lightweight preview alongside the editor |

**Key Functions**

| Function | Description |
|---|---|
| `extendMarkdownIt(md)` | Overrides the `fence` renderer rule and pushes the `devspec_fast_preview` core rule. |
| `collectAndNumberHeadings(state)` | Traverses markdown-it tokens to find `heading_open` tokens, computes section numbers, mutates tokens in-place, and returns a `Heading[]` array. |
| `replaceTocPlaceholder(state, headings)` | Searches for a `[toc]` inline token and replaces it with raw HTML for a `<nav class="toc">` list. |
| `replaceInlinePlaceholders(state)` | Replaces PlantUML image placeholder tokens with the rendered SVG image tags. |
| `renderPlantUmlFastPlaceholder(content, title)` | Encodes PlantUML source into a data URI for use as an `<img>` src, so diagrams are visible without a live Java process. |
| `computeSectionNumber(level, counters)` | Increments the counter for the given heading level and resets all deeper counters. |
| `slugify(text)` | Creates a URL-safe heading ID from the title text. |
| `makeUniqueId(base, usedIds)` | Appends a numeric suffix if the base ID has already been used (handles duplicate headings). |

---

## Core Rendering Pipeline

The end-to-end flow from a raw `.md` file to a rendered output:

```
Raw Markdown (.md)
        │
        ▼
parseDevSpecDirectives()        [devspec-directives.ts]
        │  - Expands include:: directives
        │  - Strips :key: value lines
        │  - Populates DevSpecPdfDirectives & DevSpecAttributes
        │
        ▼
renderMarkdownToHtml()          [markdown-to-html.ts]
        │  - Applies page-break markers
        │  - Calls replaceSeparatedPlantUml() (replaces include references)
        │  - Runs markdown-it with all plugins
        │    ├─ markdown-it-attrs        {.class} attribute syntax
        │    ├─ markdown-it-container    ::: blocks (alerts)
        │    ├─ markdown-it-deflist      definition lists
        │    ├─ markdown-it-footnote     [^1] footnotes
        │    ├─ markdown-it-multimd-table merged table cells
        │    ├─ markdown-it-task-lists   - [ ] checkboxes
        │    └─ highlight.js             syntax highlighting
        │  - Renders PlantUML fences via renderPlantUmlToSvg()
        │  - Numbers headings via computeSectionNumber()
        │  - Injects TOC HTML
        │  - Wraps in full HTML document with embedded CSS
        │
        ▼
HTML string (.devspec.html)
        │
        │  [PDF export path only]
        ▼
exportHtmlFileToPdf()           [pdf-exporter.ts]
        │  - Launches Puppeteer with user-supplied browser
        │  - Prints to PDF with custom header/footer templates
        │
        ▼
PDF file (.devspec.pdf)
```

---

## DevSpec Document Attributes

Attributes are lines of the form `:key: value` or `:key:` (boolean true) or `:!key!:` / `:key: false` (boolean false). They are stripped before Markdown rendering.

### Document Attributes (`DevSpecAttributes`)

| Attribute | Type | Description |
|---|---|---|
| `:toc:` | bool | Enable table of contents |
| `:toc-title: <text>` | string | TOC section title |
| `:toclevels: <n>` | number | Maximum heading depth in TOC |
| `:sectnums:` | bool | Enable automatic section numbering |
| `:sectnumlevels: <n>` | number | Maximum heading depth to number |
| `:noheader:` | bool | Hide page header (also sets `pdfShowHeader=false`) |
| `:nofooter:` | bool | Hide page footer (also sets `pdfShowFooter=false`) |
| `:imagesdir: <path>` | string | Base directory for relative image paths |
| `:icons:` | string | Icon set (currently `font`) |
| `:stylesdir: <path>` | string | Directory containing a custom stylesheet |
| `:stylesheet: <file>` | string | Custom CSS file to append after the default CSS |
| `:source-highlighter:` | string | Highlighter hint (e.g. `highlight.js`) |
| `:source-language: <lang>` | string | Default language for unlabelled code blocks |

### PDF Directives (`DevSpecPdfDirectives`)

| Attribute | Description |
|---|---|
| `:pdf-title: <text>` | Document title for PDF metadata and header/footer placeholders |
| `:pdf-owner: <text>` | Owner/team label |
| `:pdf-version: <text>` | Version string |
| `:pdf-header-left/center/right: <text>` | Header cell content (supports placeholders) |
| `:pdf-footer-left/center/right: <text>` | Footer cell content (supports placeholders) |
| `:pdf-show-header: true\|false` | Toggle header visibility |
| `:pdf-show-footer: true\|false` | Toggle footer visibility |
| `:pdf-header-*-font-size: <css>` | Font size per header cell (e.g. `14px`) |
| `:pdf-footer-*-font-size: <css>` | Font size per footer cell |
| `:pdf-header-*-font-weight: <css>` | Font weight per header cell |
| `:pdf-footer-*-font-weight: <css>` | Font weight per footer cell |

**Built-in Attribute Placeholders**

These can be used inside any attribute value with `{placeholder}`:

| Placeholder | Resolves to |
|---|---|
| `{title}` | `:pdf-title:` value |
| `{owner}` | `:pdf-owner:` value |
| `{version}` | `:pdf-version:` value |
| `{fileName}` | Source `.md` file name |
| `{page}` | Current page number (PDF only) |
| `{totalPages}` | Total page count (PDF only) |
| `{docname}` | Source file name without extension |
| `{docfile}` | Full path of the source file |
| `{docdate}` | File modification date |
| `{localdate}` | Current date |

### Include Directives

You can include a shared attribute file with:

```markdown
include::docs/config/devspec-properties.md[]
```

Paths are resolved relative to the including file. Circular includes are not supported.

---

## PDF Export Pipeline

PDF export is handled by `pdf-exporter.ts` in the core package:

1. A full HTML file is rendered and written to a temporary path (`*.devspec.tmp.html`).
2. Puppeteer is launched pointing at the user-supplied (or auto-detected) browser executable.
3. The page is loaded (`file://` URL) and `page.pdf()` is called with `format: "A4"` and `printBackground: true`.
4. Custom header and footer are injected as Chromium's native PDF header/footer templates, using the six header/footer slot values from `DevSpecPdfDirectives`.
5. The temporary HTML file is deleted in a `finally` block regardless of success or failure.

### Browser Detection Order

`findBrowserPath()` in `extension.ts` tries the following in order:

1. `devspecMarkdown.browserPath` VS Code setting
2. `DEVSPEC_BROWSER_PATH` environment variable
3. `PUPPETEER_EXECUTABLE_PATH` environment variable
4. `CHROME_PATH` environment variable
5. `EDGE_PATH` environment variable
6. Known install paths (Windows: Program Files + LocalAppData; macOS: `/Applications`; Linux: `/usr/bin`, `/snap/bin`)
7. Windows Registry `App Paths` keys (Edge, Chrome, Brave)
8. System `PATH` via `where.exe` / `which`

---

## Extension Settings Reference

All settings use the prefix `devspecMarkdown.*`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `diagramSourceDir` | string | `docs/diagrams/src` | Directory for standalone `.puml` files |
| `plantumlJarPath` | string | *(empty)* | Path to `plantuml.jar`; if empty, uses `packages/core/vendor/plantuml.jar` |
| `plantumlSecurityProfile` | enum | `SECURE` | PlantUML security profile (`SECURE` or `UNSECURE`) |
| `previewDebounceMs` | number | `700` | Milliseconds to wait before refreshing the preview after a keystroke |
| `sectionNumbering` | boolean | `true` | Enable automatic heading numbering globally |
| `sectionNumberMinLevel` | number | `2` | Minimum heading level (`h2` = 2) to number |
| `sectionNumberMaxLevel` | number | `4` | Maximum heading level to number |
| `stripExistingSectionNumbers` | boolean | `true` | Remove existing manual numbers before generating new ones |
| `browserPath` | string | *(empty)* | Override browser executable path for PDF export |

**Keyboard Shortcuts**

| Shortcut | Command |
|---|---|
| `Ctrl+Alt+V` / `Cmd+Alt+V` | `devspecMarkdown.openPreview` |
| `Ctrl+Alt+P` / `Cmd+Alt+P` | `devspecMarkdown.exportPdf` |

---

## Development Setup

### Prerequisites

- Node.js 20+
- Java (required for PlantUML rendering — `java` must be on PATH)
- A Chromium-based browser (Edge, Chrome, Brave, or Chromium) for PDF export

### Install

```powershell
# From the repository root
npm install
```

`postinstall` automatically runs `scripts/download-plantuml.mjs`, which downloads `plantuml.jar` into `packages/core/vendor/`.

### Compile

```powershell
npm run compile
```

This compiles `core`, then `cli`, then `vscode-extension` in dependency order.

### Watch Mode

Open two terminals:

```powershell
# Terminal 1 — rebuild core on change
npm run watch:core

# Terminal 2 — rebuild extension on change
npm run watch:extension
```

### Run the Extension

1. Open the repository root in VS Code.
2. Press `F5` to launch an **Extension Development Host** window.
3. Open any `.md` file, then run `DevSpec: Open Preview` from the Command Palette.

### Render a Sample Document

```powershell
# HTML
npm run sample:html

# PDF (adjust browser path for your OS)
npm run sample:pdf
```

---

## Building and Packaging

### Compile All Packages

```powershell
npm run compile
```

### Package as VSIX

```powershell
npm run package:vsix
```

This runs `compile`, then `scripts/prepare-vsix.mjs` which copies the compiled output and bundled `@devspec-markdown/core` into the `build/vsix/` directory and calls `vsce package`.

### Clean Build Artifacts

```powershell
npm run clean
```

---

## Architecture Decision Notes

### Why a monorepo with a separate `core` package?

The same rendering logic — Markdown → HTML, PlantUML, section numbering, TOC — is used by both the CLI and the VS Code extension. Placing it in `packages/core` means:

- The CLI and extension always use identical output.
- The core can be independently tested without VS Code APIs.
- Future consumers (e.g. a web server) can import `@devspec-markdown/core` directly.

### Why not use VS Code's built-in Markdown renderer for the DevSpec preview?

VS Code's built-in renderer runs in a sandboxed context and does not support synchronous child process calls (needed for `plantuml.jar`). The custom webview panel (`previewPanel.ts`) runs in the extension host, where Node.js APIs are available, enabling synchronous PlantUML rendering.

### Why is `markdownItPlugin.ts` separate from `previewPanel.ts`?

`markdownItPlugin.ts` integrates with VS Code's **built-in** Markdown preview (the `vscode.markdown-language-features` extension). It has access only to the markdown-it instance and must work within that system's constraints (no Node.js child processes). It provides a lightweight preview with section numbering and TOC but no PDF directives or custom CSS. The custom DevSpec preview panel provides the full feature set.

### Why is browser detection done in the extension rather than in `core`?

PDF export is a VS Code-specific workflow. The CLI accepts `--browser` as a CLI argument and does not need auto-detection. Placing detection in `extension.ts` keeps the core library free of VS Code and operating-system-specific logic.

### Why `retainContextWhenHidden: true` on the webview?

The live preview retains its DOM and JavaScript state when the panel is hidden (e.g. the user switches tabs). This avoids a full re-render when the panel is revealed again, which is important for large documents with many PlantUML diagrams.
