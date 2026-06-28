import * as vscode from "vscode";

export interface DiagramCompletionMatch {
	range: vscode.Range;
	items: vscode.CompletionItem[];
}

interface DiagramFenceCompletion {
	label: string;
	insertText: string;
	detail: string;
	documentation: string;
}

const FENCE_COMPLETIONS: DiagramFenceCompletion[] = [
	{
		label: "```mermaid flowchart",
		detail: "Mermaid flowchart",
		documentation: "Insert a Mermaid flowchart fence.",
		insertText: "```mermaid\nflowchart TD\n    A[${1:Start}] --> B[${2:Process}]\n    B --> C{${3:Decision?}}\n    C -->|Yes| D[${4:Success}]\n    C -->|No| E[${5:Failure}]\n```\n$0"
	},
	{
		label: "```mermaid sequenceDiagram",
		detail: "Mermaid sequence diagram",
		documentation: "Insert a Mermaid sequence diagram fence.",
		insertText: "```mermaid\nsequenceDiagram\n    participant ${1:User}\n    participant ${2:API}\n    participant ${3:Service}\n    ${1:User}->>${2:API}: ${4:Request}\n    ${2:API}->>${3:Service}: ${5:Forward}\n    ${3:Service}-->>${2:API}: ${6:Result}\n    ${2:API}-->>${1:User}: ${7:Response}\n```\n$0"
	},
	{
		label: "```mermaid stateDiagram",
		detail: "Mermaid state diagram",
		documentation: "Insert a Mermaid state diagram fence.",
		insertText: "```mermaid\nstateDiagram-v2\n    [*] --> ${1:Created}\n    ${1:Created} --> ${2:Running}: ${3:start}\n    ${2:Running} --> ${4:Completed}: ${5:success}\n    ${2:Running} --> ${6:Failed}: ${7:error}\n    ${4:Completed} --> [*]\n    ${6:Failed} --> [*]\n```\n$0"
	},
	{
		label: "```plantuml sequence",
		detail: "PlantUML sequence diagram",
		documentation: "Insert a PlantUML sequence diagram fence.",
		insertText: "```plantuml\n@startuml\nactor ${1:User}\nparticipant \"${2:Public API}\" as PublicApi\nparticipant \"${3:Service}\" as Service\ndatabase \"${4:Database}\" as Db\n\n${1:User} -> PublicApi: ${5:Request}\nPublicApi -> Service: ${6:Forward request}\nService -> Db: ${7:Read/Write data}\nDb --> Service: ${8:Result}\nService --> PublicApi: ${9:Response}\nPublicApi --> ${1:User}: ${10:Result}\n@enduml\n```\n$0"
	},
	{
		label: "```java title",
		detail: "Java code block with title",
		documentation: "Insert a Java code fence with title metadata.",
		insertText: "```java title=\"${1:ClassName.java}\"\n${2:// code}\n```\n$0"
	},
	{
		label: "```sql title",
		detail: "SQL code block with title",
		documentation: "Insert a SQL code fence with title metadata.",
		insertText: "```sql title=\"${1:schema.sql}\"\n${2:SELECT * FROM table_name;}\n```\n$0"
	},
	{
		label: "```json title",
		detail: "JSON code block with title",
		documentation: "Insert a JSON code fence with title metadata.",
		insertText: "```json title=\"${1:example.json}\"\n{\n  \"${2:key}\": \"${3:value}\"\n}\n```\n$0"
	}
];

export function getDiagramCompletionMatch(
	document: vscode.TextDocument,
	position: vscode.Position
): DiagramCompletionMatch | undefined {
	const linePrefix = document.lineAt(position).text.slice(0, position.character);
	const fenceMatch = linePrefix.match(/(^|\s)(`{3}[A-Za-z]*)$/);

	if (!fenceMatch) {
		return undefined;
	}

	const typed = fenceMatch[2];
	const range = new vscode.Range(
		position.line,
		position.character - typed.length,
		position.line,
		position.character
	);

	return {
		range,
		items: FENCE_COMPLETIONS.map((entry) => createFenceItem(entry, range))
	};
}

function createFenceItem(entry: DiagramFenceCompletion, range: vscode.Range): vscode.CompletionItem {
	const item = new vscode.CompletionItem(entry.label, vscode.CompletionItemKind.Snippet);
	item.detail = entry.detail;
	item.documentation = new vscode.MarkdownString(entry.documentation);
	item.insertText = new vscode.SnippetString(entry.insertText);
	item.range = range;
	item.filterText = entry.label;
	item.sortText = `0_${entry.label}`;
	return item;
}
