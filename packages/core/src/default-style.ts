export const DEFAULT_DEVSPEC_CSS = `
@page {
  size: A4;
  margin: 20mm 16mm 18mm 16mm;
}

:root {
  --ink: #172033;
  --text: #1f2937;
  --muted: #64748b;
  --soft: #f8fafc;
  --panel: #f4f7fb;
  --line: #d8dee9;
  --line-strong: #cbd5e1;
  --accent: #2f5f98;
  --accent-strong: #174f88;
  --accent-soft: #eaf1fb;
  --code-bg: #f8fafc;
  --code-border: #d7dde8;
  --table-head: #e8eef8;
  --note: #0969da;
  --tip: #1a7f37;
  --important: #8250df;
  --warning: #9a6700;
  --caution: #cf222e;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #ffffff !important;
  color: var(--text);
  font-family: "Segoe UI", "Noto Sans", Arial, sans-serif;
  font-size: 14px;
  text-rendering: optimizeLegibility;
}

/* ==========================================================================
   VS Code preview shell only. PDF/exported HTML keeps the plain document body.
   ========================================================================== */

@media screen {
  html,
  body {
    background: #eef2f7 !important;
  }

  body.devspec-preview {
    min-height: 100vh;
    color-scheme: light;
  }

  .devspec-preview-shell {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(47, 95, 152, 0.12), transparent 34%),
      radial-gradient(circle at bottom right, rgba(130, 80, 223, 0.08), transparent 32%),
      linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
  }

  .devspec-preview-toolbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 48px;
    padding: 0 28px;
    border-bottom: 1px solid rgba(216, 222, 233, 0.92);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
    color: var(--ink);
    box-shadow: 0 1px 8px rgba(15, 23, 42, 0.06);
  }

  .devspec-preview-toolbar-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .devspec-preview-toolbar strong {
    color: var(--ink);
    font-size: 14px;
    font-weight: 750;
    white-space: nowrap;
  }

  .devspec-preview-toolbar span,
  .devspec-preview-toolbar-meta {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .devspec-preview-main {
    box-sizing: border-box;
    max-width: 1180px;
    margin: 0 auto;
    padding: 32px 28px 72px 28px;
  }

  .devspec-paper {
    box-sizing: border-box;
    max-width: 980px;
    min-height: calc(100vh - 126px);
    margin: 0 auto;
    padding: 44px 58px 76px 58px;
    border: 1px solid #d8dee9;
    border-radius: 14px;
    background: #ffffff !important;
    box-shadow:
      0 18px 50px rgba(15, 23, 42, 0.08),
      0 2px 8px rgba(15, 23, 42, 0.04);
  }
}

/* ==========================================================================
   Base Markdown document style
   ========================================================================== */

.markdown-body {
  box-sizing: border-box;
  max-width: 980px;
  margin: 0 auto;
  padding: 36px 44px 64px 44px;
  color: var(--text);
  background: #ffffff !important;
  line-height: 1.62;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  color: var(--ink);
  font-family: "Segoe UI", "Noto Sans", Arial, sans-serif;
  font-weight: 750;
  page-break-after: avoid;
  break-after: avoid;
  line-height: 1.25;
}

.markdown-body h1 {
  font-size: 35px;
  margin: 0 0 22px 0;
  padding-bottom: 12px;
  border-bottom: 3px solid var(--accent-strong);
  letter-spacing: -0.025em;
}

.markdown-body h2 {
  font-size: 26px;
  margin: 32px 0 14px 0;
  padding: 0 0 7px 0;
  border-bottom: 1px solid var(--line);
  letter-spacing: -0.015em;
}

.markdown-body h3 {
  font-size: 20px;
  margin: 24px 0 10px 0;
  color: #24324b;
}

.markdown-body h4 {
  font-size: 15px;
  margin: 18px 0 6px 0;
  color: #334155;
  font-weight: 700;
}

.markdown-body p {
  margin: 8px 0 13px 0;
}

.markdown-body strong,
.markdown-body b {
  font-weight: 600;
  color: inherit;
}

.markdown-body em,
.markdown-body i {
  font-style: italic;
}

.markdown-body a {
  color: #0969da;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 24px 0;
}

/* ==========================================================================
   Long text / PDF overflow protection
   ========================================================================== */

.markdown-body,
.markdown-body * {
  box-sizing: border-box;
}

.markdown-body {
  width: 100%;
  max-width: 980px;
  overflow-wrap: break-word;
  word-wrap: break-word;
}

.markdown-body p,
.markdown-body li,
.markdown-body td,
.markdown-body th,
.markdown-body blockquote,
.markdown-body dd,
.markdown-body dt {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-body a {
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* ==========================================================================
   TOC
   ========================================================================== */

.markdown-body .toc {
  margin: 18px 0 40px 0;
  padding: 20px 22px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 2px;
}

@media screen {
  .markdown-body .toc {
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  }
}

.markdown-body .toc-title {
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 16px 0;
  padding: 0 0 10px 0;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
}

.markdown-body .toc-list {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.markdown-body .toc-list li {
  margin: 7px 0;
  line-height: 1.35;
}

.markdown-body .toc-list li a {
  display: flex;
  align-items: baseline;
  width: 100%;
  color: #334155;
  text-decoration: none;
  font-weight: 400;
}

.markdown-body .toc-list li a:hover {
  color: #0969da;
}

.markdown-body .toc-list li a::before {
  content: none;
}

.markdown-body .toc-entry-title {
  flex: 1;
  display: flex;
  align-items: baseline;
  min-width: 0;
  color: #374151;
  font-weight: 400;
}

.markdown-body .toc-entry-title::after {
  content: "";
  flex: 1;
  border-bottom: 1.6px dotted #a8b2c3;
  margin: 0 8px;
  transform: translateY(-4px);
}

.markdown-body .toc-list li a::after {
  content: "";
  min-width: 26px;
  text-align: right;
  color: #6b7280;
  font-weight: 400;
}

.markdown-body .toc-level-2 {
  padding-left: 0;
  font-size: 13px;
}

.markdown-body .toc-level-3 {
  padding-left: 20px;
  font-size: 12.5px;
}

.markdown-body .toc-level-4 {
  padding-left: 38px;
  font-size: 12px;
}

.markdown-body .toc-list li a,
.markdown-body .toc-entry-title {
  min-width: 0;
  max-width: 100%;
}

.markdown-body .toc-entry-title {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-body .toc-entry-title::after {
  min-width: 18px;
}

/* ==========================================================================
   Tables
   ========================================================================== */

.markdown-body table {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin: 12px 0 24px 0;
  border: 1px solid var(--line);
  font-size: 12.8px;
  page-break-inside: auto;
  break-inside: auto;
}

.markdown-body thead {
  display: table-header-group;
}

.markdown-body tbody {
  page-break-inside: auto;
  break-inside: auto;
}

.markdown-body tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

.markdown-body thead th,
.markdown-body table th {
  background: var(--table-head);
  color: #172033;
  font-weight: 700;
  text-align: left;
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-body tbody td,
.markdown-body table td {
  border: 1px solid #e0e4ec;
  padding: 6px 8px;
  vertical-align: top;
  color: #1f2937;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-body tbody tr:nth-child(even) td {
  background: #fbfcfe;
}

/* ==========================================================================
   Images and PlantUML diagrams
   ========================================================================== */

.markdown-body figure.diagram-block,
.markdown-body .diagram-block,
.markdown-body .plantuml-diagram {
  margin: 16px 0 26px 0;
  padding: 12px;
  border: 1px solid var(--line);
  background: #ffffff;
  border-radius: 2px;
  page-break-inside: avoid;
  break-inside: avoid;
  text-align: center;
  overflow-x: auto;
}

@media screen {
  .markdown-body figure.diagram-block,
  .markdown-body .diagram-block,
  .markdown-body .plantuml-diagram {
    margin: 22px 0 32px 0;
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  }
}

.markdown-body figure.diagram-block img,
.markdown-body .diagram-block img,
.markdown-body img,
.markdown-body .plantuml-diagram svg,
.markdown-body .plantuml-diagram img.plantuml-svg-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.markdown-body figcaption,
.markdown-body .plantuml-diagram figcaption {
  margin-top: 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--muted);
  font-style: italic;
}

/* ==========================================================================
   Beautiful code blocks
   ========================================================================== */

.markdown-body code,
.markdown-body pre,
.markdown-body .hljs {
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, Monaco, "Courier New", monospace;
}

.markdown-body code.inline-code,
.markdown-body :not(pre) > code {
  padding: 0.15em 0.38em;
  border: 1px solid #d8dee9;
  border-radius: 5px;
  background: #f1f5f9;
  color: #172033;
  font-size: 0.9em;

  /* Important for long paths, URLs, class names, method names */
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
}

.markdown-body .listingblock {
  position: relative;
  margin: 18px 0 28px 0;
  border: 1px solid var(--code-border);
  border-radius: 10px;
  background: var(--code-bg);
  overflow: hidden;
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.05);
  page-break-inside: auto;
  break-inside: auto;
}

.markdown-body .listingblock::before {
  content: attr(data-lang);
  position: absolute;
  top: 7px;
  right: 12px;
  z-index: 2;
  color: #64748b;
  background: #eef2f7;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 2px 8px;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.markdown-body .listing-title {
  margin: 0;
  padding: 8px 14px;
  background: linear-gradient(180deg, #f1f5f9 0%, #eaf0f7 100%);
  border-bottom: 1px solid var(--code-border);
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.markdown-body .listing-content {
  position: relative;
  margin: 0;
}

.markdown-body pre.highlight,
.markdown-body pre {
  margin: 0;
  padding: 16px 18px;
  background: var(--code-bg) !important;
  color: #243044 !important;
  border: 0;
  overflow: auto;
  white-space: pre;
  tab-size: 4;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, Monaco, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.38;
}

.markdown-body pre code,
.markdown-body pre code.hljs {
  display: block;
  padding: 0;
  background: transparent !important;
  color: inherit;
  border: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.markdown-body .code-line {
  display: block;
  min-height: 1.35em;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Only show line numbers when code has the line-numbers class. */
.markdown-body pre code.line-numbers {
  counter-reset: code-line;
}

.markdown-body pre code.line-numbers .code-line {
  counter-increment: code-line;
  padding-left: 3.2em;
  position: relative;
}

.markdown-body pre code.line-numbers .code-line::before {
  content: counter(code-line);
  position: absolute;
  left: 0;
  width: 2.3em;
  color: #94a3b8;
  text-align: right;
  user-select: none;
}

.markdown-body .hljs-comment,
.markdown-body .hljs-quote {
  color: #7a8699;
  font-style: italic;
}

.markdown-body .hljs-keyword,
.markdown-body .hljs-selector-tag,
.markdown-body .hljs-subst,
.markdown-body .hljs-built_in {
  color: #7c3aed;
  font-weight: 700;
}

.markdown-body .hljs-string,
.markdown-body .hljs-doctag {
  color: #047857;
}

.markdown-body .hljs-title,
.markdown-body .hljs-section,
.markdown-body .hljs-function {
  color: #2563eb;
  font-weight: 700;
}

.markdown-body .hljs-number,
.markdown-body .hljs-literal,
.markdown-body .hljs-variable,
.markdown-body .hljs-attr {
  color: #ea580c;
}

.markdown-body .hljs-type,
.markdown-body .hljs-class .hljs-title,
.markdown-body .hljs-tag,
.markdown-body .hljs-name,
.markdown-body .hljs-attribute {
  color: #0f766e;
}

/* ==========================================================================
   Alerts and admonitions
   ========================================================================== */

.markdown-body .markdown-alert {
  margin: 14px 0 18px 0;
  padding: 2px 0 2px 14px;
  border-left: 4px solid #d0d7de;
  background: transparent;
  page-break-inside: avoid;
  break-inside: avoid;
}

.markdown-body .markdown-alert p {
  margin: 6px 0;
}

.markdown-body .markdown-alert-title {
  margin: 0 0 6px 0 !important;
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  font-weight: 700;
}

.markdown-body .markdown-alert-title::before {
  display: inline-block;
  width: 16px;
  min-width: 16px;
  text-align: center;
  font-size: 14px;
  line-height: 1;
}

.markdown-body .markdown-alert-note { border-left-color: var(--note); }
.markdown-body .markdown-alert-note .markdown-alert-title { color: var(--note); }
.markdown-body .markdown-alert-note .markdown-alert-title::before { content: "ⓘ"; }

.markdown-body .markdown-alert-tip { border-left-color: var(--tip); }
.markdown-body .markdown-alert-tip .markdown-alert-title { color: var(--tip); }
.markdown-body .markdown-alert-tip .markdown-alert-title::before { content: "✓"; }

.markdown-body .markdown-alert-important { border-left-color: var(--important); }
.markdown-body .markdown-alert-important .markdown-alert-title { color: var(--important); }
.markdown-body .markdown-alert-important .markdown-alert-title::before { content: "▣"; }

.markdown-body .markdown-alert-warning { border-left-color: var(--warning); }
.markdown-body .markdown-alert-warning .markdown-alert-title { color: var(--warning); }
.markdown-body .markdown-alert-warning .markdown-alert-title::before { content: "⚠"; }

.markdown-body .markdown-alert-caution { border-left-color: var(--caution); }
.markdown-body .markdown-alert-caution .markdown-alert-title { color: var(--caution); }
.markdown-body .markdown-alert-caution .markdown-alert-title::before { content: "⦿"; }

.markdown-body blockquote {
  margin: 14px 0;
  padding: 10px 16px;
  border-left: 4px solid var(--accent);
  background: var(--panel);
  color: #334155;
}

.markdown-body .admonition {
  position: relative;
  margin: 14px 0 18px 0;
  padding: 10px 14px 10px 44px;
  border: 1px solid var(--line);
  border-left-width: 5px;
  border-radius: 2px;
  background: #ffffff;
  page-break-inside: avoid;
  break-inside: avoid;
}

.markdown-body .admonition::before {
  position: absolute;
  top: 10px;
  left: 12px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  color: white;
  font-family: Arial, sans-serif;
  font-size: 12px;
  font-weight: 800;
  line-height: 22px;
  text-align: center;
}

.markdown-body .admonition.note { border-left-color: var(--note); background: #f3f9fd; }
.markdown-body .admonition.note::before { content: "i"; background: var(--note); }
.markdown-body .admonition.warning { border-left-color: var(--warning); background: #fff8eb; }
.markdown-body .admonition.warning::before { content: "!"; background: var(--warning); }
.markdown-body .admonition.tip { border-left-color: var(--tip); background: #f1fbf5; }
.markdown-body .admonition.tip::before { content: "✓"; background: var(--tip); }
.markdown-body .admonition p:first-child { margin-top: 0; }
.markdown-body .admonition p:last-child { margin-bottom: 0; }

/* ==========================================================================
   Lists, footnotes, page breaks
   ========================================================================== */

.markdown-body ul,
.markdown-body ol {
  margin: 8px 0 14px 0;
  padding-left: 26px;
}

.markdown-body li {
  margin: 3px 0;
}

.markdown-body .task-list-item {
  list-style-type: none;
}

.markdown-body .task-list-item input {
  margin-right: 7px;
}

.markdown-body .footnotes {
  margin-top: 28px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}

.markdown-body .page-break {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 32px 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.markdown-body .page-break::before,
.markdown-body .page-break::after {
  content: "";
  flex: 1;
  border-top: 1px dashed #94a3b8;
}

.markdown-body .page-break::before {
  content: "Page break";
  flex: none;
  padding: 3px 10px;
  border: 1px dashed #94a3b8;
  border-radius: 999px;
  background: #f8fafc;
}

.markdown-body .plantuml-error {
  margin: 16px 0;
  padding: 12px 14px;
  border-left: 4px solid #cf222e;
  background: #fff5f5;
  color: #1f2937;
}

/* Mermaid diagrams */
.markdown-body .mermaid-diagram {
  margin: 20px 0 24px 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #ffffff;
  overflow-x: auto;
  text-align: center;
}

.markdown-body .mermaid-diagram pre.mermaid {
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  text-align: center;
  white-space: normal;
  overflow: visible;
}

.markdown-body .mermaid-diagram pre.mermaid svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin-left: auto;
  margin-right: auto;
}

.markdown-body .mermaid-diagram svg {
  max-width: 100%;
  height: auto;
}

.markdown-body .mermaid-rendered {
  display: block;
  width: 100%;
  overflow: visible;
  text-align: center;
}

.markdown-body .mermaid-rendered svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.markdown-body .mermaid-diagram figcaption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.markdown-body .mermaid-error {
  margin: 8px 0 0 0;
  padding: 8px 10px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, Monaco, "Courier New", monospace;
  font-size: 12px;
  text-align: left;
  white-space: pre-wrap;
}

/* ==========================================================================
   PDF print mode
   ========================================================================== */

@media print {
  html,
  body {
    background: #ffffff !important;
  }

  .devspec-preview-shell,
  .devspec-preview-main,
  .devspec-paper {
    display: contents !important;
  }

  .devspec-preview-toolbar {
    display: none !important;
  }

  .markdown-body {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
  }

  .markdown-body,
  .markdown-body * {
    box-sizing: border-box !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }

  .markdown-body p,
  .markdown-body li,
  .markdown-body td,
  .markdown-body th,
  .markdown-body blockquote,
  .markdown-body dd,
  .markdown-body dt,
  .markdown-body a,
  .markdown-body :not(pre) > code {
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  .markdown-body :not(pre) > code {
    white-space: normal !important;
  }

  .markdown-body .toc-list li a::after {
    content: target-counter(attr(href), page);
    min-width: 26px;
    text-align: right;
    color: #6b7280;
    font-weight: 400;
  }

  .markdown-body .plantuml-diagram,
  .markdown-body figure.diagram-block,
  .markdown-body .diagram-block {
    display: block !important;
    box-sizing: border-box !important;
    width: 100% !important;
    margin: 12px 0 22px 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    overflow: visible !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    box-shadow: none !important;
  }

  .markdown-body .plantuml-diagram img.plantuml-svg-image,
  .markdown-body figure.diagram-block img,
  .markdown-body .diagram-block img {
    display: block !important;
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: 225mm !important;
    margin: 0 auto !important;
    object-fit: contain !important;
  }

  .markdown-body .plantuml-diagram svg {
    max-width: 100% !important;
    height: auto !important;
  }

  .markdown-body .plantuml-diagram figcaption {
    margin-top: 8px !important;
    color: #6b7280 !important;
    font-size: 11px !important;
    font-style: italic !important;
    text-align: center !important;
  }

  .markdown-body .mermaid-diagram {
    display: block !important;
    box-sizing: border-box !important;
    width: 100% !important;
    margin: 12px 0 22px 0 !important;
    padding: 10px !important;
    border: 1px solid var(--line) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    overflow: visible !important;

    break-inside: auto !important;
    page-break-inside: auto !important;
  }

  .markdown-body h3:has(+ .mermaid-diagram) {
    break-after: avoid !important;
    page-break-after: avoid !important;
  }

  .markdown-body h3 + .mermaid-diagram {
    break-before: avoid !important;
    page-break-before: avoid !important;
  }

  .markdown-body .mermaid-diagram pre.mermaid {
    display: none !important;
  }

  .markdown-body .mermaid-rendered {
    display: block !important;
    width: 100% !important;
    overflow: visible !important;
    text-align: center !important;
  }

  .markdown-body .mermaid-rendered svg {
    display: block !important;
    width: auto !important;
    max-width: 100% !important;
    max-height: 620px !important;
    height: auto !important;
    margin: 0 auto !important;
  }

  .markdown-body .listingblock,
  .markdown-body .listing-content,
  .markdown-body pre.highlight,
  .markdown-body pre,
  .markdown-body pre code,
  .markdown-body pre code.hljs {
    break-inside: auto !important;
    page-break-inside: auto !important;
    overflow: visible !important;
  }

  .markdown-body .listingblock {
    margin: 10px 0 16px 0 !important;
    border-radius: 1px !important;
    box-shadow: none !important;
    box-decoration-break: clone !important;
    -webkit-box-decoration-break: clone !important;
  }

  .markdown-body pre.highlight,
  .markdown-body pre {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 100% !important;
    font-size: 10.5px !important;
    line-height: 1.32 !important;
    padding: 10px 12px !important;

    /* PDF must wrap long code lines instead of clipping horizontally */
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  .markdown-body pre code,
  .markdown-body pre code.hljs {
    max-width: 100% !important;
    white-space: inherit !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  .markdown-body .listingblock::before {
    max-width: 72px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  .markdown-body .listingblock,
  .markdown-body .listing-content {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 100% !important;
  }
  
  .markdown-body .code-line {
    display: block !important;
    max-width: 100% !important;
    white-space: inherit !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .markdown-body .page-break {
    display: block !important;
    break-before: page !important;
    page-break-before: always !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    color: transparent !important;
  }

  .markdown-body .page-break::before,
  .markdown-body .page-break::after {
    content: "" !important;
    border: 0 !important;
  }

  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3 {
    break-after: avoid;
    page-break-after: avoid;
  }

.markdown-body table {
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.markdown-body thead {
  display: table-header-group !important;
}

.markdown-body tbody {
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.markdown-body tr {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}

.markdown-body .markdown-alert,
.markdown-body .admonition {
  break-inside: avoid;
  page-break-inside: avoid;
}
}
`;
