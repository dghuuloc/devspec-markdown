import fs from "node:fs";
import path from "node:path";
import { renderMarkdownToHtml, type RenderMarkdownOptions } from "./markdown-to-html";
import { DEFAULT_DEVSPEC_CSS } from "./default-style";
import { parseDevSpecDirectives } from "./devspec-directives";

export interface BuildHtmlFileOptions extends Omit<RenderMarkdownOptions, "markdown" | "baseDir"> {
    inputFile: string;
    outputFile: string;
    baseDir?: string;
}

export function buildHtmlFile(options: BuildHtmlFileOptions): string {
    const inputFile = path.resolve(options.inputFile);
    const outputFile = path.resolve(options.outputFile);
    const baseDir = options.baseDir ? path.resolve(options.baseDir) : process.cwd();
    const parsed = parseDevSpecDirectives(fs.readFileSync(inputFile, "utf8"), {
        inputFile
    });
    const documentDir = path.dirname(inputFile);
    const imageBaseDir = parsed.attrs.imagesDir
        ? path.resolve(documentDir, parsed.attrs.imagesDir)
        : documentDir;

    const result = renderMarkdownToHtml({
        ...options,
        markdown: parsed.markdown,
        baseDir,
        css: options.css ?? buildDocumentCss(parsed.attrs, documentDir),
        title: parsed.pdf.pdfTitle ?? options.title ?? path.basename(inputFile),
        tocEnabled: parsed.attrs.toc ?? options.tocEnabled ?? false,
        tocTitle: parsed.attrs.tocTitle ?? options.tocTitle,
        tocMaxLevel: parsed.attrs.tocLevels ?? options.tocMaxLevel,
        sourceLanguage: parsed.attrs.sourceLanguage ?? options.sourceLanguage,
        sectionNumbering: {
            ...(options.sectionNumbering ?? {}),
            enabled: parsed.attrs.sectNums ?? options.sectionNumbering?.enabled,
            maxLevel: parsed.attrs.sectNumLevels ?? options.sectionNumbering?.maxLevel
        },
        imageUriResolver: options.imageUriResolver ?? ((src) => {
            if (/^(https?:|data:|file:)/i.test(src)) {
                return src;
            }

            return path.resolve(imageBaseDir, src);
        })
    });

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, result.html, "utf8");

    return outputFile;
}

function buildDocumentCss(
    attrs: {
        stylesDir?: string;
        stylesheet?: string;
    },
    documentDir: string
): string {
    if (!attrs.stylesheet) {
        return DEFAULT_DEVSPEC_CSS;
    }

    const stylesDir = attrs.stylesDir
        ? path.resolve(documentDir, attrs.stylesDir)
        : documentDir;
    const stylesheetPath = path.resolve(stylesDir, attrs.stylesheet);

    if (!fs.existsSync(stylesheetPath)) {
        return DEFAULT_DEVSPEC_CSS;
    }

    return `${DEFAULT_DEVSPEC_CSS}

/* Custom stylesheet: ${stylesheetPath} */
${fs.readFileSync(stylesheetPath, "utf8")}`;
}