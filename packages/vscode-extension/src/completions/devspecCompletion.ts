import * as vscode from "vscode";

export interface DevSpecCompletionMatch {
	range: vscode.Range;
	items: vscode.CompletionItem[];
}

interface DevSpecSnippetCompletion {
	label: string;
	insertText: string;
	detail: string;
	documentation: string;
	filterText?: string;
}

const DEVSPEC_SNIPPETS: DevSpecSnippetCompletion[] = [
	{
		label: "dsdoc",
		detail: "DevSpec document skeleton",
		documentation: "Insert a full DevSpec document skeleton.",
		insertText: `# \${1:Document Title}

:pdf-title: \${1:Document Title}
:pdf-version: \${2:1.0.0}
:pdf-owner: \${3:Owner}

## Update History

| Version | Date | Author | Changes |
|---|---|---|---|
| \${2:1.0.0} | \${CURRENT_YEAR}-\${CURRENT_MONTH}-\${CURRENT_DATE} | \${3:Owner} | Initial version |

## 1. Introduction

\${4:Describe the background, purpose, and scope of this DevSpec.}

## 2. Requirements

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| REQ-001 | \${5:Requirement description} | High | \${6:Notes} |

## 3. Architecture

\`\`\`mermaid
flowchart TD
    A[Client] --> B[API]
    B --> C[Service]
    C --> D[Database]
\`\`\`

## 4. API Design

### 4.1 \${7:Endpoint Name}

| Item | Value |
|---|---|
| Method | \`\${8:GET}\` |
| Path | \`\${9:/v1/resource}\` |
| Auth | \`\${10:Required}\` |
| Description | \${11:Description} |

## 5. Test Cases

| ID | Scenario | Input | Expected Result |
|---|---|---|---|
| TC-001 | \${12:Scenario} | \${13:Input} | \${14:Expected result} |
\$0`
	},
	{
		label: "dsapi",
		detail: "DevSpec API section",
		documentation: "Insert API endpoint description, request, response, and error sections.",
		insertText: `### \${1:Endpoint Name}

| Item | Value |
|---|---|
| Method | \`\${2:GET}\` |
| Path | \`\${3:/v1/resource}\` |
| Auth | \`\${4:Required}\` |
| Description | \${5:Description} |

#### Request Parameters

| Name | Type | Required | Description |
|---|---|---:|---|
| \`\${6:param}\` | \`\${7:string}\` | \${8:Yes} | \${9:Description} |

#### Response Example

\`\`\`json
{
  "\${10:key}": "\${11:value}"
}
\`\`\`
\$0`
	},
	{
		label: "dsdb",
		detail: "DevSpec database table section",
		documentation: "Insert database table and columns design section.",
		insertText: `### \${1:Table Name}

| Item | Value |
|---|---|
| Physical name | \`\${2:table_name}\` |
| Purpose | \${3:Purpose of this table} |

#### Columns

| Column | Type | Nullable | Key | Description |
|---|---|---:|---|---|
| \`\${4:id}\` | \`\${5:BIGINT}\` | No | PK | \${6:Primary key} |
\$0`
	},
	{
		label: "dstest",
		detail: "DevSpec test case table",
		documentation: "Insert a test case table.",
		insertText: `| ID | Scenario | Input | Expected Result |
|---|---|---|---|
| TC-001 | \${1:Scenario} | \${2:Input} | \${3:Expected result} |
\$0`
	},
	{
		label: "dserror",
		detail: "DevSpec error code table",
		documentation: "Insert an error code table.",
		insertText: `| Code | HTTP Status | Message | Cause | Action |
|---|---:|---|---|---|
| \`\${1:ERROR_CODE}\` | \${2:400} | \${3:Message} | \${4:Cause} | \${5:Action} |
\$0`
	},
	{
		label: "dsdecision",
		detail: "DevSpec decision log",
		documentation: "Insert a decision log section.",
		insertText: `### Decision: \${1:Decision Title}

| Item | Description |
|---|---|
| Status | \`\${2:Proposed}\` |
| Date | \`\${CURRENT_YEAR}-\${CURRENT_MONTH}-\${CURRENT_DATE}\` |
| Owner | \${3:Owner} |

#### Context

\${4:Why is this decision needed?}

#### Decision

\${5:What did we decide?}

#### Consequences

- Positive: \${6:Positive impact}
- Negative: \${7:Trade-off or risk}
\$0`
	},
	{
		label: "dskatex",
		detail: "KaTeX display math block",
		documentation: "Insert a KaTeX display math block.",
		insertText: `$$
\${1:E = mc^2}
$$
\$0`
	}
];

const ADMONITION_SNIPPETS: DevSpecSnippetCompletion[] = [
	{
		label: ":::note",
		detail: "DevSpec note block",
		documentation: "Insert a note/admonition block.",
		insertText: `:::note
\${1:Useful information that users should know.}
:::
\$0`,
		filterText: ":::note"
	},
	{
		label: ":::tip",
		detail: "DevSpec tip block",
		documentation: "Insert a tip/admonition block.",
		insertText: `:::tip
\${1:Helpful advice for doing things better.}
:::
\$0`,
		filterText: ":::tip"
	},
	{
		label: ":::important",
		detail: "DevSpec important block",
		documentation: "Insert an important/admonition block.",
		insertText: `:::important
\${1:Key information users need to know.}
:::
\$0`,
		filterText: ":::important"
	},
	{
		label: ":::warning",
		detail: "DevSpec warning block",
		documentation: "Insert a warning/admonition block.",
		insertText: `:::warning
\${1:Urgent information users should notice.}
:::
\$0`,
		filterText: ":::warning"
	},
	{
		label: ":::caution",
		detail: "DevSpec caution block",
		documentation: "Insert a caution/admonition block.",
		insertText: `:::caution
\${1:Risk or negative outcome to avoid.}
:::
\$0`,
		filterText: ":::caution"
	}
];

export function getDevSpecCompletionMatch(
	document: vscode.TextDocument,
	position: vscode.Position
): DevSpecCompletionMatch | undefined {
	const linePrefix = document.lineAt(position).text.slice(0, position.character);

	const dsMatch = linePrefix.match(/(^|\s)(ds[a-z]*)$/i);
	if (dsMatch) {
		const typed = dsMatch[2];
		const range = new vscode.Range(
			position.line,
			position.character - typed.length,
			position.line,
			position.character
		);

		return {
			range,
			items: DEVSPEC_SNIPPETS.map((entry) => createSnippetItem(entry, range, "1_"))
		};
	}

	const admonitionMatch = linePrefix.match(/(^|\s)(:::[a-z]*)$/i);
	if (admonitionMatch) {
		const typed = admonitionMatch[2];
		const range = new vscode.Range(
			position.line,
			position.character - typed.length,
			position.line,
			position.character
		);

		return {
			range,
			items: ADMONITION_SNIPPETS.map((entry) => createSnippetItem(entry, range, "2_"))
		};
	}

	return undefined;
}

function createSnippetItem(
	entry: DevSpecSnippetCompletion,
	range: vscode.Range,
	sortPrefix: string
): vscode.CompletionItem {
	const item = new vscode.CompletionItem(entry.label, vscode.CompletionItemKind.Snippet);
	item.detail = entry.detail;
	item.documentation = new vscode.MarkdownString(entry.documentation);
	item.insertText = new vscode.SnippetString(entry.insertText);
	item.range = range;
	item.filterText = entry.filterText ?? entry.label;
	item.sortText = `${sortPrefix}${entry.label}`;
	return item;
}
