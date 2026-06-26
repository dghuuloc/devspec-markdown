import fs from "node:fs";
import path from "node:path";
import MarkdownIt from "markdown-it";
import markdownItAttrs from "markdown-it-attrs";
import markdownItContainer from "markdown-it-container";
import markdownItDeflist from "markdown-it-deflist";
import markdownItFootnote from "markdown-it-footnote";
import markdownItMultiMdTable from "markdown-it-multimd-table";
import markdownItTaskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import { DEFAULT_DEVSPEC_CSS } from "./default-style";
import { renderPlantUmlToSvg, type PlantUmlOptions } from "./plantuml-renderer";
import {
	computeSectionNumber,
	defaultSectionNumberingOptions,
	stripExistingSectionNumber,
	type SectionNumberingOptions
} from "./section-numbering";

export interface Heading {
	level: number;
	title: string;
	id: string;
	sectionNumber: string;
}

export interface RenderMarkdownOptions {
	markdown: string;
	baseDir: string;
	diagramSourceDir?: string;
	css?: string;
	title?: string;
	tocTitle?: string;
	tocEnabled?: boolean;
	tocMaxLevel?: number;
	sourceLanguage?: string;
	sectionNumbering?: Partial<SectionNumberingOptions>;
	plantuml?: PlantUmlOptions;
	imageUriResolver?: (src: string) => string;
	allowHtml?: boolean;
	viewMode?: "document" | "preview";
}

export interface RenderMarkdownResult {
	html: string;
	bodyHtml: string;
	headings: Heading[];
}

export function renderMarkdownToHtml(options: RenderMarkdownOptions): RenderMarkdownResult {
	const baseDir = options.baseDir;
	const diagramSourceDir = options.diagramSourceDir ?? path.join(baseDir, "docs", "diagrams", "src");
	const sectionConfig: SectionNumberingOptions = {
		...defaultSectionNumberingOptions(),
		...(options.sectionNumbering ?? {})
	};

	let markdown = options.markdown;

	markdown = markdown.replace(
		/^\s*(\{\{\s*pagebreak\s*\}\}|\{\{\s*page-break\s*\}\}|<<<|<!--\s*pagebreak\s*-->)\s*$/gim,
		"\n\n<div class=\"page-break\"></div>\n\n"
	);

	markdown = replaceSeparatedPlantUml(markdown, diagramSourceDir, options.plantuml ?? {});

	const headings: Heading[] = [];
	const md = createMarkdownRenderer(
		headings,
		sectionConfig,
		options.allowHtml ?? true,
		options.plantuml ?? {},
		options.sourceLanguage
	);

	const tocPlaceholder = `<div id="__devspec_toc_placeholder__"></div>`;
	const tocEnabled = options.tocEnabled ?? false;

	markdown = applyTocPlaceholder(markdown, {
		enabled: tocEnabled,
		placeholder: tocPlaceholder
	});

	let bodyHtml = md.render(markdown);

	if (tocEnabled) {
		bodyHtml = bodyHtml.replace(
			tocPlaceholder,
			buildTocHtml(headings, {
				title: options.tocTitle ?? "Table of Contents",
				minLevel: sectionConfig.minLevel,
				maxLevel: options.tocMaxLevel ?? sectionConfig.maxLevel
			})
		);
	}

	if (options.imageUriResolver) {
		bodyHtml = rewriteImageSources(bodyHtml, options.imageUriResolver);
	}

	const css = options.css ?? DEFAULT_DEVSPEC_CSS;
	const title = options.title ?? "DevSpec Markdown";
	const bodyClass = options.viewMode === "preview" ? ' class="devspec-preview"' : "";
	const documentBody = options.viewMode === "preview"
		? `  <div class="devspec-preview-shell">
		<main class="devspec-preview-main">
		<article class="markdown-body devspec-paper">
	${bodyHtml}
		</article>
		</main>
	</div>`
			: `  <article class="markdown-body">
	${bodyHtml}
	</article>`;

	const html = `
	<!doctype html>
	<html lang="en">
		<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${escapeHtml(title)}</title>
		<style>
		${css}
		</style>
		</head>
		<body${bodyClass}>
		${documentBody}
		</body>
	</html>
	`;

	return {
		html,
		bodyHtml,
		headings
	};
}

function replaceSeparatedPlantUml(markdown: string, diagramSourceDir: string, plantuml: PlantUmlOptions): string {
	return markdown.replace(/\{\{plantuml:([A-Za-z0-9_.-]+)\}\}/g, (_full, rawName: string) => {
		const name = sanitizeName(rawName, "diagram");
		const sourceFile = path.join(diagramSourceDir, `${name}.puml`);

		if (!fs.existsSync(sourceFile)) {
			return `
<div class="plantuml-error">
  <strong>Separated PlantUML file not found:</strong>
  <pre><code>${escapeHtml(sourceFile)}</code></pre>
</div>
`;
		}

		const svg = renderPlantUmlToSvg(fs.readFileSync(sourceFile, "utf8"), {
			...plantuml,
			cwd: path.dirname(sourceFile)
		});

		return renderPlantUmlFigure(svg, name);
	});
}

function createMarkdownRenderer(
	headings: Heading[],
	sectionConfig: SectionNumberingOptions,
	allowHtml: boolean,
	plantuml: PlantUmlOptions,
	sourceLanguage?: string
): MarkdownIt {
	const usedIds = new Map<string, number>();
	const counters: Record<number, number> = {};

	const md = new MarkdownIt({
		html: allowHtml,
		linkify: true,
		typographer: true,
		breaks: false
	});

	md.use(markdownItFootnote);
	md.use(markdownItDeflist);
	md.use(markdownItTaskLists, {
		enabled: true,
		label: true,
		labelAfter: true
	});
	md.use(markdownItMultiMdTable, {
		multiline: true,
		rowspan: true,
		headerless: true,
		multibody: true,
		autolabel: true
	});
	md.use(markdownItAttrs);
	md.use(markdownItContainer, "note", {
		render(tokens: Array<{ nesting: number }>, idx: number) {
			return tokens[idx].nesting === 1 ? `<div class="admonition note">\n` : `</div>\n`;
		}
	});

	md.use(markdownItContainer, "warning", {
		render(tokens: Array<{ nesting: number }>, idx: number) {
			return tokens[idx].nesting === 1 ? `<div class="admonition warning">\n` : `</div>\n`;
		}
	});
	md.use(markdownItAlerts);

	md.renderer.rules.fence = (tokens, idx) => {
		const token = tokens[idx];
		const info = parseFenceInfo(token.info || "");
		const language = info.language || sourceLanguage || "text";

		if (info.language === "plantuml" || info.language === "puml") {
			const svg = renderPlantUmlToSvg(token.content, plantuml);
			return renderPlantUmlFigure(svg, info.title);
		}

		const highlighted = highlightCode(token.content, language);
		const codeClass = info.lineNumbers
			? `hljs language-${escapeHtml(language)} line-numbers`
			: `hljs language-${escapeHtml(language)}`;
		const titleHtml = info.title ? `<div class="listing-title">${escapeHtml(info.title)}</div>\n` : "";
		const codeHtml = wrapCodeLines(highlighted);

		return `
			<div class="listingblock" data-lang="${escapeHtml(language)}">
			${titleHtml}<div class="listing-content"><pre class="highlight"><code class="${codeClass}">${codeHtml}</code></pre></div>
			</div>
			`;
	};

	md.core.ruler.push("devspec_headings", (state) => {
		for (let i = 0; i < state.tokens.length; i += 1) {
			const token = state.tokens[i];

			if (token.type !== "heading_open") {
				continue;
			}

			const level = Number(token.tag.replace("h", ""));
			const inlineToken = state.tokens[i + 1];

			if (!inlineToken || inlineToken.type !== "inline") {
				continue;
			}

			if (sectionConfig.stripExisting) {
				inlineToken.content = stripExistingSectionNumber(inlineToken.content);

				for (const child of inlineToken.children ?? []) {
					if (child.type === "text") {
						child.content = stripExistingSectionNumber(child.content);
						break;
					}
				}
			}

			const cleanTitle = stripExistingSectionNumber(stripInlineMarkdown(inlineToken.content));
			const id = makeUniqueId(slugifyHeading(cleanTitle), usedIds);
			const sectionNumber = computeSectionNumber(level, counters, sectionConfig);

			token.attrSet("id", id);

			if (sectionNumber) {
				const open = new state.Token("span_open", "span", 1);
				open.attrSet("class", "section-number");

				const text = new state.Token("text", "", 0);
				text.content = `${sectionNumber} `;

				const close = new state.Token("span_close", "span", -1);

				inlineToken.children = inlineToken.children ?? [];
				inlineToken.children.unshift(close);
				inlineToken.children.unshift(text);
				inlineToken.children.unshift(open);
				inlineToken.content = `${sectionNumber} ${cleanTitle}`;
			}

			headings.push({
				level,
				title: cleanTitle,
				id,
				sectionNumber
			});
		}
	});

	md.core.ruler.push("devspec_source_lines", (state) => {
		for (const token of state.tokens) {
			if (!token.map || token.nesting !== 1) {
				continue;
			}

			if (typeof token.attrSet !== "function") {
				continue;
			}

			token.attrSet("data-source-line", String(token.map[0] + 1));
		}
	});

	return md;
}

function markdownItAlerts(md: MarkdownIt): void {
	const labels: Record<string, string> = {
		note: "Note",
		tip: "Tip",
		important: "Important",
		warning: "Warning",
		caution: "Caution"
	};

	md.core.ruler.after("block", "github_style_alerts", (state) => {
		const tokens = state.tokens;

		for (let i = 0; i < tokens.length; i += 1) {
			const blockquoteOpen = tokens[i];

			if (blockquoteOpen.type !== "blockquote_open") {
				continue;
			}

			const paragraphOpen = tokens[i + 1];
			const inline = tokens[i + 2];

			if (!paragraphOpen || !inline || paragraphOpen.type !== "paragraph_open" || inline.type !== "inline") {
				continue;
			}

			const match = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i);

			if (!match) {
				continue;
			}

			const type = match[1].toLowerCase();
			inline.content = inline.content.replace(match[0], "");

			for (const child of inline.children ?? []) {
				if (child.type === "text") {
					child.content = child.content.replace(match[0], "");
					break;
				}
			}

			blockquoteOpen.tag = "div";
			blockquoteOpen.attrSet("class", `markdown-alert markdown-alert-${type}`);

			let depth = 1;
			for (let j = i + 1; j < tokens.length; j += 1) {
				if (tokens[j].type === "blockquote_open") depth += 1;
				if (tokens[j].type === "blockquote_close") {
					depth -= 1;
					if (depth === 0) {
						tokens[j].tag = "div";
						break;
					}
				}
			}

			const titleToken = new state.Token("html_block", "", 0);
			titleToken.content = `<p class="markdown-alert-title">${labels[type]}</p>\n`;
			tokens.splice(i + 1, 0, titleToken);
			i += 1;
		}
	});
}


function renderPlantUmlFigure(svgOrHtml: string, caption: string): string {
	const body = isSvg(svgOrHtml)
		? `<img class="plantuml-svg-image" src="${svgToDataUri(svgOrHtml)}" alt="${escapeHtml(caption || "PlantUML diagram")}" />`
		: svgOrHtml;
	const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";

	return `
<figure class="plantuml-diagram">
${body}
${captionHtml}
</figure>
`;
}

function isSvg(value: string): boolean {
	return value.trimStart().startsWith("<svg");
}

function svgToDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function applyTocPlaceholder(
	markdown: string,
	options: {
		enabled: boolean;
		placeholder: string;
	}
): string {
	const tocCommentPattern =
		/<!--\s*(\{\{\s*TOC\s*\}\}|\[\[\s*TOC\s*\]\])\s*-->/i;

	const tocPattern =
		/(\{\{\s*TOC\s*\}\}|\[\[\s*TOC\s*\]\])/i;

	if (!options.enabled) {
		return markdown
			.replace(new RegExp(tocCommentPattern.source, "gi"), "")
			.replace(new RegExp(tocPattern.source, "gi"), "");
	}

	if (tocCommentPattern.test(markdown)) {
		return markdown.replace(tocCommentPattern, options.placeholder);
	}

	if (tocPattern.test(markdown)) {
		return markdown.replace(tocPattern, options.placeholder);
	}

	if (/^#\s+.+$/m.test(markdown)) {
		return markdown.replace(
			/^#\s+.+$/m,
			(match) => `${match}\n\n${options.placeholder}`
		);
	}

	return `${options.placeholder}\n\n${markdown}`;
}

function buildTocHtml(headings: Heading[], options: { title: string; minLevel: number; maxLevel: number }): string {
	const tocHeadings = headings.filter((heading) => heading.level >= options.minLevel && heading.level <= options.maxLevel);

	if (tocHeadings.length === 0) {
		return "";
	}

	const lines: string[] = [];
	lines.push(`<nav class="toc">`);
	lines.push(`  <h2 class="toc-title">${escapeHtml(options.title)}</h2>`);
	lines.push(`  <ol class="toc-list">`);

	for (const heading of tocHeadings) {
		const displayTitle = heading.sectionNumber ? `${heading.sectionNumber} ${heading.title}` : heading.title;
		lines.push(`    <li class="toc-level-${heading.level}"><a href="#${heading.id}"><span class="toc-entry-title">${escapeHtml(displayTitle)}</span></a></li>`);
	}

	lines.push(`  </ol>`);
	lines.push(`</nav>`);

	return lines.join("\n");
}

function rewriteImageSources(html: string, imageUriResolver: (src: string) => string): string {
	return html.replace(/<img([^>]+?)src="([^"]+)"([^>]*)>/g, (full, before, src, after) => {
		if (/^(https?:|data:|vscode-resource:|file:)/i.test(src)) {
			return full;
		}

		return `<img${before}src="${escapeHtml(imageUriResolver(src))}"${after}>`;
	});
}

function parseFenceInfo(info: string): { language: string; title: string; lineNumbers: boolean } {
	const raw = info.trim();
	const language = normalizeCodeLanguage(raw.split(/\s+/)[0] ?? "");
	const titleMatch = raw.match(/\btitle=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
	const title = titleMatch ? (titleMatch[1] || titleMatch[2] || titleMatch[3]) : "";
	const lineNumbers = /\b(linenums|line-numbers|linenumbers)\b/i.test(raw);

	return { language, title, lineNumbers };
}

function normalizeCodeLanguage(value: string): string {
	const aliases: Record<string, string> = {
		js: "javascript",
		ts: "typescript",
		sh: "bash",
		shell: "bash",
		yml: "yaml",
		ps1: "powershell",
		puml: "plantuml"
	};

	const raw = value.toLowerCase().trim();
	return aliases[raw] ?? raw;
}

function highlightCode(source: string, language: string): string {
	try {
		if (language && hljs.getLanguage(language)) {
			return hljs.highlight(source, { language, ignoreIllegals: true }).value;
		}

		return hljs.highlightAuto(source).value;
	} catch {
		return escapeHtml(source);
	}
}

function wrapCodeLines(code: string): string {
	const normalizedCode = code
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/\n+$/g, "");

	if (!normalizedCode) {
		return `<span class="code-line">&nbsp;</span>`;
	}

	return normalizedCode
		.split("\n")
		.map((line) => `<span class="code-line">${line || "&nbsp;"}</span>`)
		.join("");
}

function makeUniqueId(baseId: string, usedIds: Map<string, number>): string {
	const count = usedIds.get(baseId) ?? 0;
	usedIds.set(baseId, count + 1);
	return count === 0 ? baseId : `${baseId}-${count + 1}`;
}

function slugifyHeading(value: string): string {
	let slug = stripInlineMarkdown(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");

	if (!slug) slug = "section";
	if (!/^[a-z][a-z0-9-]*$/.test(slug)) slug = `sec-${slug}`;

	return slug;
}

function stripInlineMarkdown(value: string): string {
	return value
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/~~([^~]+)~~/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function sanitizeName(value: string, fallback: string): string {
	const safe = value
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[^A-Za-z0-9_.-]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");

	return safe || fallback;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}
