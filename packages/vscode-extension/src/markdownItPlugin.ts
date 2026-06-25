/**
 * Extends a markdown-it instance with DevSpec-specific rendering.
 *
 * Registered as a `markdown.markdownItPlugin` contribution so VS Code
 * calls this function when loading the built-in Markdown preview.
 *
 * **Enhancements applied:**
 *
 * 1. **PlantUML fence renderer** — Overrides the default `fence` rule to
 *    intercept ` ```plantuml ` and ` ```puml ` blocks and replace them with
 *    an informational placeholder (no Java process is spawned in the
 *    built-in preview context).
 *
 * 2. **`devspec_fast_preview` core rule** — A post-processing pass that:
 *    - Collects all headings, computes section numbers, and mutates tokens
 *      in-place via {@link collectAndNumberHeadings}.
 *    - Replaces `[[TOC]]` / `{{TOC}}` paragraph tokens with a generated
 *      `<nav class="devspec-toc">` list via {@link replaceTocPlaceholder}.
 *    - Replaces `{{pagebreak}}` and `{{plantuml:name}}` inline tokens with
 *      placeholder HTML via {@link replaceInlinePlaceholders}.
 *
 * @param md - The markdown-it instance to extend.
 * @returns The same `md` instance (mutated in-place) for chaining.
 */
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

/** Represents a single numbered heading extracted from a parsed document. */
interface Heading {
    /** ATX heading level (1–6). Only levels 2–4 are numbered. */
    level: number;
    /** Plain-text heading title with inline Markdown stripped. */
    title: string;
    /** URL-safe, unique anchor ID assigned to the heading element. */
    id: string;
    /** Computed section number string, e.g. `"2.3.1."`. */
    sectionNumber: string;
}

/**
 * Traverses all markdown-it tokens to find `heading_open` tokens at levels
 * 2–4, computes hierarchical section numbers, and mutates both the
 * `heading_open` token (adds `id` attribute) and the following `inline`
 * token (prepends the section number to the text content).
 *
 * @param state - The markdown-it core state object containing the full token
 *   stream.
 * @returns An ordered array of {@link Heading} descriptors for all numbered
 *   headings, used later to build the table of contents.
 */
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

/**
 * Searches the markdown-it token stream for an inline token whose content
 * matches `[[TOC]]` or `{{TOC}}` (case-insensitive) and replaces it with
 * a raw `html_block` token containing the generated `<nav>` list.
 *
 * When the TOC placeholder appears as the sole content of a paragraph
 * (`paragraph_open` → `inline` → `paragraph_close`), the surrounding
 * paragraph tokens are removed as well.
 *
 * @param state - The markdown-it core state object.
 * @param headings - The list of numbered headings produced by
 *   {@link collectAndNumberHeadings}.
 */
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

/**
 * Searches the markdown-it token stream for inline tokens that contain
 * DevSpec-specific shorthand patterns and replaces them with raw HTML block
 * tokens:
 *
 * - `{{pagebreak}}` / `{{page-break}}` → `<div class="devspec-page-break">`
 * - `{{plantuml:name}}` → a PlantUML placeholder figure (no Java process)
 *
 * When a matched token appears as the sole content of a paragraph, the
 * surrounding paragraph tokens are removed.
 *
 * @param state - The markdown-it core state object.
 */
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

/**
 * Builds a `<nav class="devspec-toc">` HTML string from an array of
 * {@link Heading} descriptors.
 *
 * Each heading becomes an `<li>` element whose CSS class encodes the
 * heading level (`devspec-toc-level-2`, etc.) so the stylesheet can
 * indent nested entries.
 *
 * @param headings - The ordered list of numbered headings.
 * @returns A complete `<nav>` HTML fragment.
 */
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

/**
 * Returns an HTML placeholder `<figure>` that stands in for an embedded
 * PlantUML diagram in the built-in VS Code preview.
 *
 * PlantUML rendering (via `java -jar plantuml.jar`) is intentionally skipped
 * in the built-in preview context to keep the preview fast and avoid
 * spawning Java on every keystroke. The full DevSpec preview panel performs
 * the real render.
 *
 * The PlantUML source is shown inside a collapsible `<details>` element so
 * it remains accessible without cluttering the preview.
 *
 * @param source - Raw PlantUML source code (the fenced block content).
 * @param title - Optional diagram title parsed from the fence info string
 *   (e.g. ` ```plantuml title="My Diagram" `).
 * @returns An HTML string for the placeholder figure.
 */
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

/**
 * Returns an HTML placeholder `<figure>` for a `{{plantuml:name}}`
 * inline reference to a separated `.puml` file.
 *
 * Separated PlantUML files (stored under `docs/diagrams/src/`) are also
 * skipped in the built-in preview for performance reasons.
 *
 * @param name - The diagram name from the `{{plantuml:name}}` shorthand.
 * @returns An HTML string for the placeholder figure.
 */
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

/**
 * Extracts a `title=` value from a markdown-it fence info string.
 *
 * Supports double-quoted (`title="…"`), single-quoted (`title='…'`), and
 * unquoted (`title=value`) forms.
 *
 * @param info - The full fence info string, e.g.
 *   `"plantuml title=\"My Diagram\""`.
 * @returns The extracted title, or an empty string when not found.
 */
function parseTitle(info: string): string {
    const match = info.match(/\btitle=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);

    if (!match) {
        return "";
    }

    return match[1] || match[2] || match[3] || "";
}

/**
 * Increments the counter for `level` and resets all counters for deeper
 * levels, then returns the formatted section number string.
 *
 * Section numbers start at heading level 2 (`h2`). A level-2 heading gets
 * a number like `"1."`, a level-3 heading gets `"1.2."`, and so on.
 *
 * @param level - The ATX heading level (2–4).
 * @param counters - Mutable counter map, keyed by heading level.
 * @returns The formatted section number string, e.g. `"2.3.1."`.
 */
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

/**
 * Returns a unique heading anchor ID derived from `base`.
 *
 * The first occurrence returns `base` unchanged. Subsequent occurrences
 * return `base-2`, `base-3`, etc.
 *
 * @param base - The base slug produced by {@link slugify}.
 * @param usedIds - Mutable map tracking how many times each base has been
 *   used within the current document.
 * @returns A unique ID string.
 */
function makeUniqueId(base: string, usedIds: Map<string, number>): string {
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);

    return count === 0 ? base : `${base}-${count + 1}`;
}

/**
 * Converts a heading title to a URL-safe anchor ID.
 *
 * The title is lower-cased, non-alphanumeric sequences are replaced with
 * hyphens, and leading/trailing hyphens are trimmed. An empty result
 * falls back to `"section"`.
 *
 * @param value - The plain-text heading title.
 * @returns A lowercase hyphenated slug string.
 */
function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");

    return slug || "section";
}

/**
 * Strips common inline Markdown formatting from a text string so that
 * heading anchor IDs and section-number prefixes are based on the plain
 * text only.
 *
 * Removed patterns: inline code, bold (`**`), italic (`*`), strikethrough
 * (`~~`), link labels, and HTML tags.
 *
 * @param value - The raw inline token content.
 * @returns The plain-text string with all inline markup removed.
 */
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

/**
 * Removes a leading section number (e.g. `"2.3."` or `"1.2.3"`) from a
 * heading title.
 *
 * This prevents duplicate numbers when the document already contains
 * manually written numbers and the plugin re-numbers them automatically.
 *
 * @param value - The heading title, possibly prefixed with a section number.
 * @returns The heading title with any leading section number removed.
 */
function stripExistingSectionNumber(value: string): string {
    return value.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, "").trim();
}

/**
 * Escapes HTML special characters in `value` so it can be safely embedded
 * in an HTML attribute or text node.
 *
 * @param value - The raw string to escape.
 * @returns The HTML-escaped string.
 */
function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}