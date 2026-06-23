export function extendMarkdownIt(md: any): any {
    const defaultFence =
        md.renderer.rules.fence ??
        ((tokens: any[], idx: number, options: any, env: any, self: any) => {
            return self.renderToken(tokens, idx, options);
        });

    md.renderer.rules.fence = (
        tokens: any[],
        idx: number,
        options: any,
        env: any,
        self: any
    ) => {
        const token = tokens[idx];
        const info = String(token.info || "").trim();
        const language = info.split(/\s+/)[0].toLowerCase();

        if (language === "plantuml" || language === "puml") {
            return renderPlantUmlFastPlaceholder(token.content, parseTitle(info));
        }

        return defaultFence(tokens, idx, options, env, self);
    };

    md.core.ruler.push("devspec_fast_preview", (state: any) => {
        const headings = collectAndNumberHeadings(state);
        replaceTocPlaceholder(state, headings);
        replaceInlinePlaceholders(state);
    });

    return md;
}

interface Heading {
    level: number;
    title: string;
    id: string;
    sectionNumber: string;
}

function collectAndNumberHeadings(state: any): Heading[] {
    const headings: Heading[] = [];
    const counters: Record<number, number> = {};
    const usedIds = new Map<string, number>();

    for (let i = 0; i < state.tokens.length; i += 1) {
        const token = state.tokens[i];

        if (token.type !== "heading_open") {
            continue;
        }

        const level = Number(String(token.tag).replace("h", ""));
        const inline = state.tokens[i + 1];

        if (!inline || inline.type !== "inline") {
            continue;
        }

        if (level < 2 || level > 4) {
            continue;
        }

        const cleanTitle = stripExistingSectionNumber(stripInlineMarkdown(inline.content));
        const sectionNumber = computeSectionNumber(level, counters);
        const id = makeUniqueId(slugify(cleanTitle), usedIds);

        token.attrSet("id", id);

        // Add section number only for fast preview.
        if (sectionNumber && !inline.content.startsWith(sectionNumber)) {
            inline.content = `${sectionNumber} ${cleanTitle}`;

            if (inline.children && inline.children.length > 0) {
                const textChild = inline.children.find((child: any) => child.type === "text");

                if (textChild) {
                    textChild.content = `${sectionNumber} ${cleanTitle}`;
                }
            }
        }

        headings.push({
            level,
            title: cleanTitle,
            id,
            sectionNumber
        });
    }

    return headings;
}

function replaceTocPlaceholder(state: any, headings: Heading[]): void {
    for (let i = 0; i < state.tokens.length; i += 1) {
        const token = state.tokens[i];

        if (token.type !== "inline") {
            continue;
        }

        const content = String(token.content || "");

        if (!/\{\{\s*TOC\s*\}\}|\[\[\s*TOC\s*\]\]/i.test(content)) {
            continue;
        }

        const htmlToken = new state.Token("html_block", "", 0);
        htmlToken.content = buildTocHtml(headings);

        const previous = state.tokens[i - 1];
        const next = state.tokens[i + 1];

        if (previous?.type === "paragraph_open" && next?.type === "paragraph_close") {
            state.tokens.splice(i - 1, 3, htmlToken);
            i -= 1;
        } else {
            state.tokens.splice(i, 1, htmlToken);
        }
    }
}

function replaceInlinePlaceholders(state: any): void {
    for (let i = 0; i < state.tokens.length; i += 1) {
        const token = state.tokens[i];

        if (token.type !== "inline") {
            continue;
        }

        const content = String(token.content || "");

        if (
            !/\{\{\s*pagebreak\s*\}\}/i.test(content) &&
            !/\{\{\s*page-break\s*\}\}/i.test(content) &&
            !/\{\{\s*plantuml:[^}]+\}\}/i.test(content)
        ) {
            continue;
        }

        const replaced = content
            .replace(/\{\{\s*pagebreak\s*\}\}/gi, `<div class="devspec-page-break">Page break</div>`)
            .replace(/\{\{\s*page-break\s*\}\}/gi, `<div class="devspec-page-break">Page break</div>`)
            .replace(/\{\{\s*plantuml:([^}]+)\}\}/gi, (_match, name) => {
                return renderSeparatedPlantUmlFastPlaceholder(String(name).trim());
            });

        const htmlToken = new state.Token("html_block", "", 0);
        htmlToken.content = replaced;

        const previous = state.tokens[i - 1];
        const next = state.tokens[i + 1];

        if (previous?.type === "paragraph_open" && next?.type === "paragraph_close") {
            state.tokens.splice(i - 1, 3, htmlToken);
            i -= 1;
        } else {
            state.tokens.splice(i, 1, htmlToken);
        }
    }
}

function buildTocHtml(headings: Heading[]): string {
    const items = headings
        .map((heading) => {
            const text = `${heading.sectionNumber} ${heading.title}`;

            return `
<li class="devspec-toc-level-${heading.level}">
  <a href="#${escapeHtml(heading.id)}">${escapeHtml(text)}</a>
</li>`;
        })
        .join("\n");

    return `
<nav class="devspec-toc">
  <h2>Table of Contents</h2>
  <ol>
${items}
  </ol>
</nav>
`;
}

function renderPlantUmlFastPlaceholder(source: string, title: string): string {
    const heading = title || "Embedded PlantUML";

    return `
<figure class="devspec-plantuml-fast">
  <div class="devspec-plantuml-fast-title">${escapeHtml(heading)}</div>
  <div class="devspec-plantuml-fast-body">
    PlantUML rendering is skipped in fast live preview to keep typing smooth.
    Use <strong>DevSpec: Open Full Preview</strong> or <strong>Export PDF</strong> for final diagrams.
  </div>
  <details>
    <summary>Show PlantUML source</summary>
    <pre><code>${escapeHtml(source)}</code></pre>
  </details>
</figure>
`;
}

function renderSeparatedPlantUmlFastPlaceholder(name: string): string {
    return `
<figure class="devspec-plantuml-fast">
  <div class="devspec-plantuml-fast-title">PlantUML: ${escapeHtml(name)}</div>
  <div class="devspec-plantuml-fast-body">
    Separated PlantUML is skipped in fast live preview.
    Use <strong>DevSpec: Open Full Preview</strong> or <strong>Export PDF</strong> to render it.
  </div>
</figure>
`;
}

function parseTitle(info: string): string {
    const match = info.match(/\btitle=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);

    if (!match) {
        return "";
    }

    return match[1] || match[2] || match[3] || "";
}

function computeSectionNumber(level: number, counters: Record<number, number>): string {
    counters[level] = (counters[level] || 0) + 1;

    for (let i = level + 1; i <= 6; i += 1) {
        counters[i] = 0;
    }

    const parts: number[] = [];

    for (let i = 2; i <= level; i += 1) {
        if (!counters[i]) {
            counters[i] = 1;
        }

        parts.push(counters[i]);
    }

    return `${parts.join(".")}.`;
}

function makeUniqueId(base: string, usedIds: Map<string, number>): string {
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);

    return count === 0 ? base : `${base}-${count + 1}`;
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");

    return slug || "section";
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

function stripExistingSectionNumber(value: string): string {
    return value.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, "").trim();
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}