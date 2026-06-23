# DevSpec Markdown Monorepo

This is a runnable VS Code extension + CLI project using the separated structure:

```text
devspec-markdown/
├─ packages/
│  ├─ core/
│  ├─ cli/
│  └─ vscode-extension/
├─ docs/
└─ package.json
```

## Why this structure

- `packages/core` contains reusable Markdown, PlantUML, TOC, section numbering, and PDF logic.
- `packages/cli` calls the core from terminal.
- `packages/vscode-extension` calls the same core from VS Code preview.

## Install

```powershell
rm -r -fo node_modules
del package-lock.json

npm install
npm install --save-dev typescript

npx --no-install tsc -v
npm run compile
```

or Reinstall:

```powershell
npm uninstall tsc

npm install --save-dev typescript
npm run compile
```

## Test VS Code extension

Open this folder in VS Code.

Press `F5` to start the Extension Development Host.

In the new VS Code window, open:

```text
docs/templates/sample-devspec.md
```

Then run:

```text
Ctrl + Shift + P
DevSpec: Open Preview
```

## PlantUML setup

Set your PlantUML jar path in VS Code settings:

```json
{
  "devspecMarkdown.plantumlJarPath": "C:/tools/plantuml/plantuml.jar",
  "devspecMarkdown.diagramSourceDir": "docs/diagrams/src"
}
```

Without `plantuml.jar`, the preview still works, but PlantUML blocks show a helpful warning box.

## Build VSIX

```powershell
npm run package -w devspec-markdown-vscode
```

Then install locally:

```powershell
code --install-extension packages/vscode-extension/devspec-markdown-vscode-0.0.1.vsix
```

## Syntax

* Disable heading numbering
Use one of these:

```
:sectnums: false
```
or:
```
:sectnums!:
```
