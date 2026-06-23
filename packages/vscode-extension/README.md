# DevSpec Markdown

DevSpec Markdown is a custom VS Code preview and PDF export tool for Markdown documents.

## Features

- Custom Markdown preview
- Table of contents
- Section numbering
- PlantUML diagrams
- Code highlighting
- GitHub-style alerts
- PDF export with header/footer attributes

## Commands

- `DevSpec: Open Preview`
- `DevSpec: Export Current Markdown to HTML`
- `DevSpec: Export Current Markdown to PDF`

## Example

```md
# My Document

:toc:
:toc-title: Table of Contents
:toclevels: 4

:sectnums:
:sectnumlevels: 4

:pdf-title: My Document
:pdf-header-left: {title}
:pdf-footer-right: Page {page} / {totalPages}
```