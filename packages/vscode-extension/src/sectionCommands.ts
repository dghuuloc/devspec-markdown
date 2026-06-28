import * as vscode from "vscode";
import { getActiveMarkdownEditor, isMarkdownDocument } from "./configuration";

export function registerSectionCommands(context: vscode.ExtensionContext): void {
	registerSnippetCommand(context, "devspecMarkdown.insert.apiSection", createApiSectionSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.databaseTable", createDatabaseTableSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.sequenceDiagram", createPlantUmlSequenceSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.mermaidFlowchart", createMermaidFlowchartSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.mermaidStateDiagram", createMermaidStateSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.errorTable", createErrorTableSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.testCaseTable", createTestCaseTableSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.decisionLog", createDecisionLogSnippet());
	registerSnippetCommand(context, "devspecMarkdown.insert.riskTable", createRiskTableSnippet());
}

function registerSnippetCommand(
	context: vscode.ExtensionContext,
	command: string,
	snippet: vscode.SnippetString
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(command, async () => {
			await insertSnippet(snippet);
		})
	);
}

async function insertSnippet(snippet: vscode.SnippetString): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isMarkdownDocument(editor.document)) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	await editor.insertSnippet(snippet, editor.selection.active);
}

function createSnippet(lines: string[]): vscode.SnippetString {
	return new vscode.SnippetString(lines.join("\n"));
}

function createApiSectionSnippet(): vscode.SnippetString {
	return createSnippet([
		"### ${1:Endpoint Name}",
		"",
		"| Item | Value |",
		"|---|---|",
		"| Method | `${2:GET}` |",
		"| Path | `${3:/v1/resource}` |",
		"| Auth | `${4:Required}` |",
		"| Description | ${5:Description} |",
		"",
		"#### Request Parameters",
		"",
		"| Name | Type | Required | Description |",
		"|---|---|---:|---|",
		"| `${6:param}` | `${7:string}` | ${8:Yes} | ${9:Description} |",
		"",
		"#### Request Example",
		"",
		"```json",
		"{",
		"  \"${10:key}\": \"${11:value}\"",
		"}",
		"```",
		"",
		"#### Response Example",
		"",
		"```json",
		"{",
		"  \"${12:key}\": \"${13:value}\"",
		"}",
		"```",
		"",
		"#### Error Codes",
		"",
		"| Code | Message | Description |",
		"|---|---|---|",
		"| `${14:ERROR_CODE}` | ${15:Message} | ${16:Description} |",
		"",
		"$0"
	]);
}

function createDatabaseTableSnippet(): vscode.SnippetString {
	return createSnippet([
		"### ${1:Table Name}",
		"",
		"| Item | Value |",
		"|---|---|",
		"| Physical name | `${2:table_name}` |",
		"| Purpose | ${3:Purpose of this table} |",
		"",
		"#### Columns",
		"",
		"| Column | Type | Nullable | Key | Description |",
		"|---|---|---:|---|---|",
		"| `${4:id}` | `${5:BIGINT}` | No | PK | ${6:Primary key} |",
		"",
		"#### Indexes",
		"",
		"| Index | Columns | Unique | Purpose |",
		"|---|---|---:|---|",
		"| `${7:idx_name}` | `${8:column_name}` | ${9:No} | ${10:Purpose} |",
		"",
		"$0"
	]);
}

function createPlantUmlSequenceSnippet(): vscode.SnippetString {
	return createSnippet([
		"```plantuml",
		"@startuml",
		"actor ${1:User}",
		"participant \"${2:Public API}\" as PublicApi",
		"participant \"${3:Service}\" as Service",
		"database \"${4:Database}\" as Db",
		"",
		"${1:User} -> PublicApi: ${5:Request}",
		"PublicApi -> Service: ${6:Forward request}",
		"Service -> Db: ${7:Read/Write data}",
		"Db --> Service: ${8:Result}",
		"Service --> PublicApi: ${9:Response}",
		"PublicApi --> ${1:User}: ${10:Result}",
		"@enduml",
		"```",
		"$0"
	]);
}

function createMermaidFlowchartSnippet(): vscode.SnippetString {
	return createSnippet([
		"```mermaid",
		"flowchart TD",
		"    A[${1:Start}] --> B[${2:Process}]",
		"    B --> C{${3:Decision?}}",
		"    C -->|Yes| D[${4:Success}]",
		"    C -->|No| E[${5:Failure}]",
		"```",
		"$0"
	]);
}

function createMermaidStateSnippet(): vscode.SnippetString {
	return createSnippet([
		"```mermaid",
		"stateDiagram-v2",
		"    [*] --> ${1:Created}",
		"    ${1:Created} --> ${2:Running}: ${3:start}",
		"    ${2:Running} --> ${4:Completed}: ${5:success}",
		"    ${2:Running} --> ${6:Failed}: ${7:error}",
		"    ${4:Completed} --> [*]",
		"    ${6:Failed} --> [*]",
		"```",
		"$0"
	]);
}

function createErrorTableSnippet(): vscode.SnippetString {
	return createSnippet([
		"| Code | HTTP Status | Message | Cause | Action |",
		"|---|---:|---|---|---|",
		"| `${1:ERROR_CODE}` | ${2:400} | ${3:Message} | ${4:Cause} | ${5:Action} |",
		"$0"
	]);
}

function createTestCaseTableSnippet(): vscode.SnippetString {
	return createSnippet([
		"| ID | Scenario | Input | Expected Result |",
		"|---|---|---|---|",
		"| TC-001 | ${1:Scenario} | ${2:Input} | ${3:Expected result} |",
		"$0"
	]);
}

function createDecisionLogSnippet(): vscode.SnippetString {
	return createSnippet([
		"### Decision: ${1:Decision Title}",
		"",
		"| Item | Description |",
		"|---|---|",
		"| Status | `${2:Proposed}` |",
		"| Date | `${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}` |",
		"| Owner | ${3:Owner} |",
		"",
		"#### Context",
		"",
		"${4:Why is this decision needed?}",
		"",
		"#### Decision",
		"",
		"${5:What did we decide?}",
		"",
		"#### Consequences",
		"",
		"- Positive: ${6:Positive impact}",
		"- Negative: ${7:Trade-off or risk}",
		"",
		"$0"
	]);
}

function createRiskTableSnippet(): vscode.SnippetString {
	return createSnippet([
		"| Risk | Impact | Probability | Mitigation | Owner |",
		"|---|---|---|---|---|",
		"| ${1:Risk description} | ${2:High} | ${3:Medium} | ${4:Mitigation plan} | ${5:Owner} |",
		"$0"
	]);
}
