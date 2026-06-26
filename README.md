# <p align="center"> DevSpec Markdown Support for Visual Studio Code </p>

**DevSpec Markdown** is a VS Code extension for writing professional technical documentation in Markdown — with live preview, automatic table of contents, section numbering, PlantUML diagrams, syntax-highlighted code blocks, HTML export, and polished PDF output with custom headers, footers, and page numbers.

Built for engineering documents: development specifications, architecture records, API design notes, implementation summaries, runbooks, and internal technical reports.

:toc:

---
## Features

|                           |                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------- |
| 🖥️ **Live preview**        | Dedicated DevSpec preview panel with debounced auto-refresh                           |
| 📄 **HTML export**         | Export to a self-contained `.devspec.html` file                                       |
| 📑 **PDF export**          | Export to a print-ready `.devspec.pdf` with headers, footers, and page numbers        |
| 📋 **Table of contents**   | Auto-generated TOC from Markdown headings                                             |
| 🔢 **Section numbering**   | Automatic hierarchical heading numbers (`1.`, `1.1.`, `1.1.1.`)                       |
| 🌿 **PlantUML diagrams**   | Render embedded `plantuml` fences and separated `.puml` files                         |
| 🎨 **Syntax highlighting** | Language-tagged code blocks with highlight.js                                         |
| 🚨 **Markdown alerts**     | GitHub-style `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`          |
| ⚙️ **Document attributes** | AsciiDoc-style `:key: value` directives for TOC, numbering, PDF metadata, and styling |
| 📁 **Shared config**       | Include a shared attribute file across multiple documents with `include::`            |
| 🎛️ **Custom stylesheet**   | Override the built-in CSS with your own stylesheet                                    |
