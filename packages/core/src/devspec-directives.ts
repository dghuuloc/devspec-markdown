import fs from "node:fs";
import path from "node:path";

export interface DevSpecPdfDirectives {
    pdfOwner?: string;
    pdfVersion?: string;
    pdfTitle?: string;

    pdfHeaderLeft?: string;
    pdfHeaderCenter?: string;
    pdfHeaderRight?: string;

    pdfFooterLeft?: string;
    pdfFooterCenter?: string;
    pdfFooterRight?: string;

    pdfShowHeader?: boolean;
    pdfShowFooter?: boolean;

    pdfHeaderLeftFontSize?: string;
    pdfHeaderCenterFontSize?: string;
    pdfHeaderRightFontSize?: string;

    pdfFooterLeftFontSize?: string;
    pdfFooterCenterFontSize?: string;
    pdfFooterRightFontSize?: string;

    pdfHeaderLeftFontWeight?: string;
    pdfHeaderCenterFontWeight?: string;
    pdfHeaderRightFontWeight?: string;

    pdfFooterLeftFontWeight?: string;
    pdfFooterCenterFontWeight?: string;
    pdfFooterRightFontWeight?: string;
}

export interface DevSpecAttributes {
    toc?: boolean;
    tocTitle?: string;
    tocLevels?: number;

    sectNums?: boolean;
    sectNumLevels?: number;

    noHeader?: boolean;
    noFooter?: boolean;

    imagesDir?: string;
    icons?: string;

    stylesDir?: string;
    stylesheet?: string;

    sourceHighlighter?: string;
    sourceLanguage?: string;

    docname?: string;
    docfile?: string;
    docdate?: string;
    localdate?: string;
}

export interface DevSpecDirectiveContext {
    inputFile?: string;
    localDate?: Date;
}

export interface ParsedDevSpecDocument {
    markdown: string;
    pdf: DevSpecPdfDirectives;
    attrs: DevSpecAttributes;
}

const PDF_DIRECTIVE_KEYS = new Set([
    "pdf-owner",
    "pdf-version",
    "pdf-title",

    "pdf-header-left",
    "pdf-header-center",
    "pdf-header-right",

    "pdf-footer-left",
    "pdf-footer-center",
    "pdf-footer-right",

    "pdf-show-header",
    "pdf-show-footer",

    "pdf-header-left-font-size",
    "pdf-header-center-font-size",
    "pdf-header-right-font-size",

    "pdf-footer-left-font-size",
    "pdf-footer-center-font-size",
    "pdf-footer-right-font-size",

    "pdf-header-left-font-weight",
    "pdf-header-center-font-weight",
    "pdf-header-right-font-weight",

    "pdf-footer-left-font-weight",
    "pdf-footer-center-font-weight",
    "pdf-footer-right-font-weight"
]);

const DOCUMENT_ATTRIBUTE_KEYS = new Set([
    "toc",
    "toc-title",
    "toclevels",

    "sectnums",
    "specnum",
    "sectnumlevels",

    "nofooter",
    "noheader",

    "imagesdir",
    "icons",

    "stylesdir",
    "stylesheet",

    "source-highlighter",
    "source-language"
]);

export function parseDevSpecDirectives(
    markdown: string,
    context: DevSpecDirectiveContext = {}
): ParsedDevSpecDocument {
    const expandedMarkdown = expandDevSpecIncludes(markdown, context);

    const pdf: DevSpecPdfDirectives = {};
    const attrs: DevSpecAttributes = createBuiltInAttributes(context);
    const keptLines: string[] = [];
    let foundDirective = false;

    const lines = expandedMarkdown.split(/\r?\n/);

    for (const line of lines) {
        const unsetMatch = line.match(/^:!?([A-Za-z0-9_-]+)!:\s*$/);
        const setMatch = line.match(/^:([A-Za-z0-9_-]+):\s*(.*)$/);

        const match = unsetMatch ?? setMatch;

        if (!match) {
            keptLines.push(line);
            continue;
        }

        const key = match[1].trim().toLowerCase();
        const isUnsetDirective = unsetMatch !== null;
        const rawValue = isUnsetDirective ? "false" : (match[2] ?? "").trim();
        const value = replaceBuiltInAttributes(rawValue, attrs);

        if (PDF_DIRECTIVE_KEYS.has(key)) {
            foundDirective = true;
            applyPdfDirective(pdf, key, value);
            continue;
        }

        if (DOCUMENT_ATTRIBUTE_KEYS.has(key)) {
            foundDirective = true;
            applyDocumentAttribute(attrs, pdf, key, value);
            continue;
        }

        keptLines.push(line);
    }

    const cleanedMarkdown = foundDirective
        ? cleanupTrailingDirectiveSeparator(keptLines.join("\n"))
        : markdown;

    return {
        markdown: replaceBuiltInAttributes(cleanedMarkdown, attrs),
        pdf,
        attrs
    };
}

function createBuiltInAttributes(context: DevSpecDirectiveContext): DevSpecAttributes {
    const inputFile = context.inputFile ? path.resolve(context.inputFile) : "";
    const localDate = formatDate(context.localDate ?? new Date());
    const docdate = inputFile && fs.existsSync(inputFile)
        ? formatDate(fs.statSync(inputFile).mtime)
        : localDate;

    return {
        docname: inputFile ? path.basename(inputFile, path.extname(inputFile)) : "",
        docfile: inputFile,
        docdate,
        localdate: localDate
    };
}

function applyDocumentAttribute(
    attrs: DevSpecAttributes,
    pdf: DevSpecPdfDirectives,
    key: string,
    value: string
): void {
    switch (key) {
        case "toc":
            attrs.toc = value.length === 0 ? true : parseBoolean(value);
            return;

        case "toc-title":
            attrs.tocTitle = value;
            return;

        case "toclevels":
            attrs.tocLevels = parsePositiveInteger(value);
            return;

        case "sectnums":
        case "specnum":
            attrs.sectNums = value.length === 0 ? true : parseBoolean(value);
            return;

        case "sectnumlevels":
            attrs.sectNumLevels = parsePositiveInteger(value);
            return;

        case "nofooter":
            attrs.noFooter = value.length === 0 ? true : parseBoolean(value);
            pdf.pdfShowFooter = !attrs.noFooter;
            return;

        case "noheader":
            attrs.noHeader = value.length === 0 ? true : parseBoolean(value);
            pdf.pdfShowHeader = !attrs.noHeader;
            return;

        case "imagesdir":
            attrs.imagesDir = value;
            return;

        case "icons":
            attrs.icons = value.length === 0 ? "font" : value;
            return;

        case "stylesdir":
            attrs.stylesDir = value;
            return;

        case "stylesheet":
            attrs.stylesheet = value;
            return;

        case "source-highlighter":
            attrs.sourceHighlighter = value;
            return;

        case "source-language":
            attrs.sourceLanguage = value;
            return;
    }
}

function applyPdfDirective(
    pdf: DevSpecPdfDirectives,
    key: string,
    value: string
): void {
    switch (key) {
        case "pdf-owner":
            pdf.pdfOwner = value;
            return;

        case "pdf-version":
            pdf.pdfVersion = value;
            return;

        case "pdf-title":
            pdf.pdfTitle = value;
            return;

        case "pdf-header-left":
            pdf.pdfHeaderLeft = value;
            return;

        case "pdf-header-center":
            pdf.pdfHeaderCenter = value;
            return;

        case "pdf-header-right":
            pdf.pdfHeaderRight = value;
            return;

        case "pdf-footer-left":
            pdf.pdfFooterLeft = value;
            return;

        case "pdf-footer-center":
            pdf.pdfFooterCenter = value;
            return;

        case "pdf-footer-right":
            pdf.pdfFooterRight = value;
            return;

        case "pdf-show-header":
            pdf.pdfShowHeader = parseBoolean(value);
            return;

        case "pdf-show-footer":
            pdf.pdfShowFooter = parseBoolean(value);
            return;

        case "pdf-header-left-font-size":
            pdf.pdfHeaderLeftFontSize = value;
            return;

        case "pdf-header-center-font-size":
            pdf.pdfHeaderCenterFontSize = value;
            return;

        case "pdf-header-right-font-size":
            pdf.pdfHeaderRightFontSize = value;
            return;

        case "pdf-footer-left-font-size":
            pdf.pdfFooterLeftFontSize = value;
            return;

        case "pdf-footer-center-font-size":
            pdf.pdfFooterCenterFontSize = value;
            return;

        case "pdf-footer-right-font-size":
            pdf.pdfFooterRightFontSize = value;
            return;

        case "pdf-header-left-font-weight":
            pdf.pdfHeaderLeftFontWeight = value;
            return;

        case "pdf-header-center-font-weight":
            pdf.pdfHeaderCenterFontWeight = value;
            return;

        case "pdf-header-right-font-weight":
            pdf.pdfHeaderRightFontWeight = value;
            return;

        case "pdf-footer-left-font-weight":
            pdf.pdfFooterLeftFontWeight = value;
            return;

        case "pdf-footer-center-font-weight":
            pdf.pdfFooterCenterFontWeight = value;
            return;

        case "pdf-footer-right-font-weight":
            pdf.pdfFooterRightFontWeight = value;
            return;
    }
}

function expandDevSpecIncludes(
    markdown: string,
    context: DevSpecDirectiveContext,
    depth = 0,
    includeStack: string[] = []
): string {
    if (depth > 8) {
        throw new Error("Too many nested include:: directives. Maximum depth is 8.");
    }

    const currentFile = context.inputFile ? path.resolve(context.inputFile) : undefined;
    const currentDir = currentFile ? path.dirname(currentFile) : process.cwd();

    return markdown
        .split(/\r?\n/)
        .map((line) => {
            const match = line.match(/^include::(.+?)\[\]\s*$/);

            if (!match) {
                return line;
            }

            const includePath = match[1].trim();
            const resolvedPath = path.isAbsolute(includePath)
                ? includePath
                : path.resolve(currentDir, includePath);

            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Included DevSpec config file not found: ${resolvedPath}`);
            }

            if (includeStack.includes(resolvedPath)) {
                throw new Error(
                    `Circular include detected: ${[...includeStack, resolvedPath].join(" -> ")}`
                );
            }

            const includedMarkdown = fs.readFileSync(resolvedPath, "utf8");

            return expandDevSpecIncludes(
                includedMarkdown,
                {
                    ...context,
                    inputFile: resolvedPath
                },
                depth + 1,
                [...includeStack, resolvedPath]
            );
        })
        .join("\n");
}

function replaceBuiltInAttributes(markdown: string, attrs: DevSpecAttributes): string {
    return markdown
        .replaceAll("{docname}", attrs.docname ?? "")
        .replaceAll("{docfile}", attrs.docfile ?? "")
        .replaceAll("{docdate}", attrs.docdate ?? "")
        .replaceAll("{localdate}", attrs.localdate ?? "");
}

function parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();

    if (["true", "yes", "1", "on", "enabled", "enable"].includes(normalized)) {
        return true;
    }

    if (["false", "no", "0", "off", "disabled", "disable"].includes(normalized)) {
        return false;
    }

    return false;
}

function parsePositiveInteger(value: string): number | undefined {
    const parsed = Number.parseInt(value, 10);

    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }

    return undefined;
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function cleanupTrailingDirectiveSeparator(markdown: string): string {
    return markdown.replace(/\n-{3,}\s*$/g, "").trimEnd() + "\n";
}