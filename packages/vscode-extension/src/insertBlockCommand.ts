import * as vscode from "vscode";
import { getActiveMarkdownEditor, isMarkdownDocument } from "./configuration";

interface DevSpecBlockQuickPickItem extends vscode.QuickPickItem {
	command?: string;
	snippet?: vscode.SnippetString;
}

export function registerInsertBlockCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("devspecMarkdown.insert.block", async () => {
			await insertDevSpecBlock();
		})
	);
}

async function insertDevSpecBlock(): Promise<void> {
	const editor = getActiveMarkdownEditor();

	if (!editor || !isMarkdownDocument(editor.document)) {
		vscode.window.showWarningMessage("Open a Markdown file first.");
		return;
	}

	const selected = await vscode.window.showQuickPick(createBlockItems(), {
		placeHolder: "Select a DevSpec block to insert",
		matchOnDescription: true,
		matchOnDetail: true
	});

	if (!selected) {
		return;
	}

	if (selected.command) {
		await vscode.commands.executeCommand(selected.command);
		return;
	}

	if (selected.snippet) {
		await editor.insertSnippet(selected.snippet, editor.selection.active);
	}
}

function createBlockItems(): DevSpecBlockQuickPickItem[] {
	return [
		{
			label: "$(file) Document Skeleton",
			description: "dsdoc",
			detail: "Create a full DevSpec document structure.",
			command: "devspecMarkdown.template.insertDocumentSkeleton"
		},
		{
			label: "$(symbol-method) API Section",
			description: "dsapi",
			detail: "Insert endpoint summary, request, response, and error sections.",
			command: "devspecMarkdown.insert.apiSection"
		},
		{
			label: "$(database) Database Table Section",
			description: "dsdb",
			detail: "Insert table purpose, columns, and indexes.",
			command: "devspecMarkdown.insert.databaseTable"
		},
		{
			label: "$(git-branch) Mermaid Flowchart",
			description: "dsflow",
			detail: "Insert a Mermaid flowchart block.",
			command: "devspecMarkdown.insert.mermaidFlowchart"
		},
		{
			label: "$(symbol-enum) Mermaid State Diagram",
			description: "dsstate",
			detail: "Insert a Mermaid state diagram block.",
			command: "devspecMarkdown.insert.mermaidStateDiagram"
		},
		{
			label: "$(organization) PlantUML Sequence Diagram",
			description: "dsseq",
			detail: "Insert a PlantUML sequence diagram block.",
			command: "devspecMarkdown.insert.sequenceDiagram"
		},
		{
			label: "$(warning) Error Code Table",
			description: "dserror",
			detail: "Insert a standard error handling table.",
			command: "devspecMarkdown.insert.errorTable"
		},
		{
			label: "$(beaker) Test Case Table",
			description: "dstest",
			detail: "Insert a standard test case table.",
			command: "devspecMarkdown.insert.testCaseTable"
		},
		{
			label: "$(checklist) Decision Log",
			description: "dsdecision",
			detail: "Insert decision context, decision, and consequences.",
			command: "devspecMarkdown.insert.decisionLog"
		},
		{
			label: "$(shield) Risk Table",
			description: "dsrisk",
			detail: "Insert risk, impact, probability, mitigation, and owner table.",
			command: "devspecMarkdown.insert.riskTable"
		},
		{
			label: "$(history) Update History",
			description: "dshistory",
			detail: "Insert a document update history table.",
			snippet: createUpdateHistorySnippet()
		},
		{
			label: "$(list-unordered) Requirements Table",
			description: "dsreq",
			detail: "Insert a requirements table.",
			snippet: createRequirementsSnippet()
		},
		{
			label: "$(question) Open Questions",
			description: "dsquestions",
			detail: "Insert an open questions checklist.",
			snippet: createOpenQuestionsSnippet()
		},
		{
			label: "$(symbol-operator) KaTeX Math Block",
			description: "dskatex",
			detail: "Insert a KaTeX display math block.",
			snippet: createKatexBlockSnippet()
		},
		{
			label: "$(json) JSON Example",
			description: "dsjson",
			detail: "Insert a JSON fenced code block.",
			snippet: createJsonBlockSnippet()
		},
		{
			label: "$(database) SQL Example",
			description: "dssql",
			detail: "Insert a SQL fenced code block.",
			snippet: createSqlBlockSnippet()
		},
		{
			label: "$(note) Note Block",
			description: "dsnote",
			detail: "Insert a note block.",
			snippet: createNoteBlockSnippet()
		},
		{
			label: "$(lightbulb) Tip Block",
			description: "dstip",
			detail: "Insert a tip block.",
			snippet: createTipBlockSnippet()
		},
		{
			label: "$(error) Warning Block",
			description: "dswarning",
			detail: "Insert a warning block.",
			snippet: createWarningBlockSnippet()
		}
	];
}

function createSnippet(lines: string[]): vscode.SnippetString {
	return new vscode.SnippetString(lines.join("\n"));
}

function createUpdateHistorySnippet(): vscode.SnippetString {
	return createSnippet([
		"## Update History",
		"",
		"| Version | Date | Author | Changes |",
		"|---|---|---|---|",
		"| ${1:1.0.0} | ${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE} | ${2:Author} | ${3:Initial version} |",
		"$0"
	]);
}

function createRequirementsSnippet(): vscode.SnippetString {
	return createSnippet([
		"## ${1:Requirements}",
		"",
		"| ID | Requirement | Priority | Notes |",
		"|---|---|---|---|",
		"| REQ-001 | ${2:Requirement description} | ${3:High} | ${4:Notes} |",
		"$0"
	]);
}

function createOpenQuestionsSnippet(): vscode.SnippetString {
	return createSnippet([
		"## ${1:Open Questions}",
		"",
		"- [ ] ${2:Question 1}",
		"- [ ] ${3:Question 2}",
		"- [ ] ${4:Question 3}",
		"$0"
	]);
}

function createKatexBlockSnippet(): vscode.SnippetString {
	return createSnippet([
		"$$",
		"${1:E = mc^2}",
		"$$",
		"$0"
	]);
}

function createJsonBlockSnippet(): vscode.SnippetString {
	return createSnippet([
		"```json",
		"{",
		"  \"${1:key}\": \"${2:value}\"",
		"}",
		"```",
		"$0"
	]);
}

function createSqlBlockSnippet(): vscode.SnippetString {
	return createSnippet([
		"```sql",
		"SELECT",
		"    ${1:column_name}",
		"FROM",
		"    ${2:table_name}",
		"WHERE",
		"    ${3:condition};",
		"```",
		"$0"
	]);
}

function createNoteBlockSnippet(): vscode.SnippetString {
	return createSnippet([
		"> [!NOTE]",
		"> ${1:Write important information here.}",
		"$0"
	]);
}

function createTipBlockSnippet(): vscode.SnippetString {
	return createSnippet([
		"> [!TIP]",
		"> ${1:Write a helpful tip here.}",
		"$0"
	]);
}

function createWarningBlockSnippet(): vscode.SnippetString {
	return createSnippet([
		"> [!WARNING]",
		"> ${1:Write warning information here.}",
		"$0"
	]);
}