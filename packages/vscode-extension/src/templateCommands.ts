import * as vscode from "vscode";
import { getActiveMarkdownEditor, isMarkdownDocument } from "./configuration";

export function registerTemplateCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.template.newDocument", async () => {
			await createNewDevSpecDocument();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.template.insertDocumentSkeleton", async () => {
			await insertDevSpecDocumentSkeleton();
		})
	);
}

async function createNewDevSpecDocument(): Promise<void> {
	const title = await vscode.window.showInputBox({
		prompt: "DevSpec document title",
		placeHolder: "Bulk API DevSpec",
		value: "New DevSpec Document"
	});

	if (title === undefined) {
		return;
	}

	const owner = await vscode.window.showInputBox({
		prompt: "Document owner / author",
		placeHolder: "Your name",
		value: "Author"
	});

	if (owner === undefined) {
		return;
	}

	const document = await vscode.workspace.openTextDocument({
		language: "markdown",
		content: buildDevSpecDocumentSkeleton({
			title: title.trim() || "New DevSpec Document",
			owner: owner.trim() || "Author"
		})
	});

	await vscode.window.showTextDocument(document, { preview: false });
}

async function insertDevSpecDocumentSkeleton(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isMarkdownDocument(editor.document)) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	await editor.insertSnippet(new vscode.SnippetString(buildDevSpecDocumentSkeletonSnippet()), editor.selection.active);
}

function today(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function buildDevSpecDocumentSkeleton(input: { title: string; owner: string }): string {
	return [
		`# ${input.title}`,
		"",
		`:pdf-title: ${input.title}`,
		":pdf-version: 1.0.0",
		`:pdf-owner: ${input.owner}`,
		"",
		"## Update History",
		"",
		"| Version | Date | Author | Changes |",
		"|---|---|---|---|",
		`| 1.0.0 | ${today()} | ${input.owner} | Initial version |`,
		"",
		"## 1. Introduction",
		"",
		"Describe the background, purpose, and scope of this DevSpec.",
		"",
		"## 2. Requirements",
		"",
		"| ID | Requirement | Priority | Notes |",
		"|---|---|---|---|",
		"| REQ-001 | Requirement description | High | Notes |",
		"",
		"## 3. Architecture",
		"",
		"```mermaid",
		"flowchart TD",
		"    A[Client] --> B[API]",
		"    B --> C[Service]",
		"    C --> D[Database]",
		"```",
		"",
		"## 4. API Design",
		"",
		"### 4.1 Endpoint Name",
		"",
		"| Item | Value |",
		"|---|---|",
		"| Method | `GET` |",
		"| Path | `/v1/resource` |",
		"| Auth | `Required` |",
		"| Description | Description |",
		"",
		"#### Request Parameters",
		"",
		"| Name | Type | Required | Description |",
		"|---|---|---:|---|",
		"| `param` | `string` | Yes | Description |",
		"",
		"#### Response Example",
		"",
		"```json",
		"{",
		"  \"key\": \"value\"",
		"}",
		"```",
		"",
		"## 5. Error Handling",
		"",
		"| Code | HTTP Status | Message | Cause | Action |",
		"|---|---:|---|---|---|",
		"| `ERROR_CODE` | 400 | Message | Cause | Action |",
		"",
		"## 6. Test Cases",
		"",
		"| ID | Scenario | Input | Expected Result |",
		"|---|---|---|---|",
		"| TC-001 | Scenario | Input | Expected result |",
		"",
		"## 7. Risks and Open Questions",
		"",
		"- [ ] Open question",
		""
	].join("\n");
}

function buildDevSpecDocumentSkeletonSnippet(): string {
	return [
		"# ${1:Document Title}",
		"",
		":pdf-title: ${1:Document Title}",
		":pdf-version: ${2:1.0.0}",
		":pdf-owner: ${3:Owner}",
		"",
		"## Update History",
		"",
		"| Version | Date | Author | Changes |",
		"|---|---|---|---|",
		"| ${2:1.0.0} | " + today() + " | ${3:Owner} | Initial version |",
		"",
		"## 1. Introduction",
		"",
		"${4:Describe the background, purpose, and scope of this DevSpec.}",
		"",
		"## 2. Requirements",
		"",
		"| ID | Requirement | Priority | Notes |",
		"|---|---|---|---|",
		"| REQ-001 | ${5:Requirement description} | High | ${6:Notes} |",
		"",
		"## 3. Architecture",
		"",
		"```mermaid",
		"flowchart TD",
		"    A[Client] --> B[API]",
		"    B --> C[Service]",
		"    C --> D[Database]",
		"```",
		"",
		"## 4. API Design",
		"",
		"### 4.1 ${7:Endpoint Name}",
		"",
		"| Item | Value |",
		"|---|---|",
		"| Method | `${8:GET}` |",
		"| Path | `${9:/v1/resource}` |",
		"| Auth | `${10:Required}` |",
		"| Description | ${11:Description} |",
		"",
		"## 5. Error Handling",
		"",
		"| Code | HTTP Status | Message | Cause | Action |",
		"|---|---:|---|---|---|",
		"| `${12:ERROR_CODE}` | ${13:400} | ${14:Message} | ${15:Cause} | ${16:Action} |",
		"",
		"## 6. Test Cases",
		"",
		"| ID | Scenario | Input | Expected Result |",
		"|---|---|---|---|",
		"| TC-001 | ${17:Scenario} | ${18:Input} | ${19:Expected result} |",
		"",
		"## 7. Risks and Open Questions",
		"",
		"- [ ] ${20:Open question}",
		"$0"
	].join("\n");
}
