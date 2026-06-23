import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const nodeRequire = createRequire(__filename);

const PDF_PAGE_SIDE_MARGIN = "16mm";
const PDF_CHROME_HEIGHT = "34px";

export interface ExportPdfOptions {
	htmlFile: string;
	outputFile: string;
	browserPath: string;

	title?: string;
	fileName?: string;
	owner?: string;
	version?: string;

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

interface PdfTemplateValues {
	title: string;
	fileName: string;
	owner: string;
	version: string;
	date: string;
}

export async function exportHtmlFileToPdf(options: ExportPdfOptions): Promise<string> {
	if (!options.browserPath) {
		throw new Error(
			'browserPath is required. Example: --browser "C:/Program Files/Google/Chrome/Application/chrome.exe"'
		);
	}

	const htmlFile = path.resolve(options.htmlFile);
	const outputFile = path.resolve(options.outputFile);
	const browserPath = path.resolve(options.browserPath);

	if (!fs.existsSync(htmlFile)) {
		throw new Error(`HTML file not found: ${htmlFile}`);
	}

	if (!fs.existsSync(browserPath)) {
		throw new Error(`Browser executable not found: ${browserPath}`);
	}

	const html = fs.readFileSync(htmlFile, "utf8");

	const templateValues: PdfTemplateValues = {
		title: options.title || extractHtmlTitle(html) || "",
		fileName: options.fileName || path.basename(htmlFile),
		owner: options.owner || "",
		version: options.version || "",
		date: new Date().toISOString().slice(0, 10)
	};

	const headerLeft = options.pdfHeaderLeft ?? "";
	const headerCenter = options.pdfHeaderCenter ?? "";
	const headerRight = options.pdfHeaderRight ?? "";

	const footerLeft = options.pdfFooterLeft ?? "";
	const footerCenter = options.pdfFooterCenter ?? "";
	const footerRight = options.pdfFooterRight ?? "Page {page} / {totalPages}";

	const showHeader =
		options.pdfShowHeader ?? hasAnyTemplateText(headerLeft, headerCenter, headerRight);

	const showFooter =
		options.pdfShowFooter ?? hasAnyTemplateText(footerLeft, footerCenter, footerRight);

	const puppeteer = await import("puppeteer-core");
	const browser = await puppeteer.default.launch({
		executablePath: browserPath,
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--allow-file-access-from-files"
		]
	});

	try {
		const page = await browser.newPage();

		await page.emulateMediaType("print");

		await page.goto(pathToFileURL(htmlFile).toString(), {
			waitUntil: "networkidle0",
			timeout: 60_000
		});

		await runPagedJs(page);

		fs.mkdirSync(path.dirname(outputFile), { recursive: true });

		await page.pdf({
			path: outputFile,
			format: "A4",
			printBackground: true,
			displayHeaderFooter: showHeader || showFooter,
			preferCSSPageSize: true,

			headerTemplate: showHeader
				? createHeaderTemplate({
					left: headerLeft,
					center: headerCenter,
					right: headerRight,
					values: templateValues,

					leftFontSize: options.pdfHeaderLeftFontSize ?? "12px",
					centerFontSize: options.pdfHeaderCenterFontSize ?? "12px",
					rightFontSize: options.pdfHeaderRightFontSize ?? "12px",

					leftFontWeight: options.pdfHeaderLeftFontWeight ?? "400",
					centerFontWeight: options.pdfHeaderCenterFontWeight ?? "400",
					rightFontWeight: options.pdfHeaderRightFontWeight ?? "400"
				})
				: "<span></span>",

			footerTemplate: showFooter
				? createFooterTemplate({
					left: footerLeft,
					center: footerCenter,
					right: footerRight,
					values: templateValues,

					leftFontSize: options.pdfFooterLeftFontSize ?? "12px",
					centerFontSize: options.pdfFooterCenterFontSize ?? "12px",
					rightFontSize: options.pdfFooterRightFontSize ?? "12px",

					leftFontWeight: options.pdfFooterLeftFontWeight ?? "400",
					centerFontWeight: options.pdfFooterCenterFontWeight ?? "400",
					rightFontWeight: options.pdfFooterRightFontWeight ?? "400"
				})
				: "<span></span>",

			margin: {
				top: showHeader ? "22mm" : "14mm",
				bottom: showFooter ? "20mm" : "14mm",
				left: PDF_PAGE_SIDE_MARGIN,
				right: PDF_PAGE_SIDE_MARGIN
			}
		});
	} finally {
		await browser.close();
	}

	return outputFile;
}

async function runPagedJs(page: import("puppeteer-core").Page): Promise<void> {
	await page.evaluate(() => {
		const globalScope = globalThis as unknown as {
			PagedConfig?: {
				auto: boolean;
			};
		};

		globalScope.PagedConfig = {
			auto: false
		};
	});

	await page.addScriptTag({
		path: resolvePagedJsPath()
	});

	await page.evaluate(async () => {
		const globalScope = globalThis as unknown as {
			PagedPolyfill?: {
				preview: () => Promise<unknown>;
			};
		};

		if (!globalScope.PagedPolyfill?.preview) {
			throw new Error("Paged.js was not loaded.");
		}

		await globalScope.PagedPolyfill.preview();
	});

	await page.waitForSelector(".pagedjs_page", {
		timeout: 120_000
	});
}

function resolvePagedJsPath(): string {
	const pagedJsMainFile = nodeRequire.resolve("pagedjs");
	let currentDir = path.dirname(pagedJsMainFile);

	while (true) {
		const packageJsonPath = path.join(currentDir, "package.json");

		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
				name?: string;
			};

			if (packageJson.name === "pagedjs") {
				const candidates = [
					path.join(currentDir, "dist", "paged.polyfill.js"),
					path.join(currentDir, "lib", "paged.polyfill.js")
				];

				for (const candidate of candidates) {
					if (fs.existsSync(candidate)) {
						return candidate;
					}
				}

				throw new Error(`Paged.js polyfill file was not found under: ${currentDir}`);
			}
		}

		const parentDir = path.dirname(currentDir);

		if (parentDir === currentDir) {
			break;
		}

		currentDir = parentDir;
	}

	throw new Error("Could not resolve pagedjs package root.");
}

function createHeaderTemplate(args: {
	left: string;
	center: string;
	right: string;
	values: PdfTemplateValues;

	leftFontSize: string;
	centerFontSize: string;
	rightFontSize: string;

	leftFontWeight: string;
	centerFontWeight: string;
	rightFontWeight: string;
}): string {
	return createPdfChromeTemplate({
		className: "pdf-header",
		borderCss: "border-bottom: 1px solid #e5e7eb;",
		left: args.left,
		center: args.center,
		right: args.right,
		values: args.values,

		leftFontSize: args.leftFontSize,
		centerFontSize: args.centerFontSize,
		rightFontSize: args.rightFontSize,

		leftFontWeight: args.leftFontWeight,
		centerFontWeight: args.centerFontWeight,
		rightFontWeight: args.rightFontWeight
	});
}

function createFooterTemplate(args: {
	left: string;
	center: string;
	right: string;
	values: PdfTemplateValues;

	leftFontSize: string;
	centerFontSize: string;
	rightFontSize: string;

	leftFontWeight: string;
	centerFontWeight: string;
	rightFontWeight: string;
}): string {
	return createPdfChromeTemplate({
		className: "pdf-footer",
		borderCss: "border-top: 1px solid #e5e7eb;",
		left: args.left,
		center: args.center,
		right: args.right,
		values: args.values,

		leftFontSize: args.leftFontSize,
		centerFontSize: args.centerFontSize,
		rightFontSize: args.rightFontSize,

		leftFontWeight: args.leftFontWeight,
		centerFontWeight: args.centerFontWeight,
		rightFontWeight: args.rightFontWeight
	});
}

function createPdfChromeTemplate(args: {
	className: string;
	borderCss: string;
	left: string;
	center: string;
	right: string;
	values: PdfTemplateValues;

	leftFontSize: string;
	centerFontSize: string;
	rightFontSize: string;

	leftFontWeight: string;
	centerFontWeight: string;
	rightFontWeight: string;
}): string {
	return `
<style>
  .${args.className} {
    width: 100%;
    box-sizing: border-box;
    padding: 0 ${PDF_PAGE_SIDE_MARGIN};
    font-family: "Segoe UI", "Noto Sans", Arial, sans-serif;
    color: #8b949e;
    background: #ffffff;
  }

  .${args.className}-inner {
    width: 100%;
    min-height: ${PDF_CHROME_HEIGHT};
    box-sizing: border-box;
    padding: 5px 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    ${args.borderCss}
  }

  .${args.className}-left {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${sanitizeCssSize(args.leftFontSize)};
    font-weight: ${sanitizeFontWeight(args.leftFontWeight)};
  }

  .${args.className}-center {
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${sanitizeCssSize(args.centerFontSize)};
    font-weight: ${sanitizeFontWeight(args.centerFontWeight)};
  }

  .${args.className}-right {
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${sanitizeCssSize(args.rightFontSize)};
    font-weight: ${sanitizeFontWeight(args.rightFontWeight)};
  }
</style>

<div class="${args.className}">
  <div class="${args.className}-inner">
    <span class="${args.className}-left">${renderPdfTemplateText(args.left, args.values)}</span>
    <span class="${args.className}-center">${renderPdfTemplateText(args.center, args.values)}</span>
    <span class="${args.className}-right">${renderPdfTemplateText(args.right, args.values)}</span>
  </div>
</div>
`;
}

function renderPdfTemplateText(template: string, values: PdfTemplateValues): string {
	const parts = template.split(
		/(\{page\}|\{totalPages\}|\{total-pages\}|\{title\}|\{fileName\}|\{file-name\}|\{owner\}|\{version\}|\{date\})/g
	);

	return parts
		.map((part) => {
			switch (part) {
				case "{page}":
					return `<span class="pageNumber"></span>`;

				case "{totalPages}":
				case "{total-pages}":
					return `<span class="totalPages"></span>`;

				case "{title}":
					return escapeHtml(values.title);

				case "{fileName}":
				case "{file-name}":
					return escapeHtml(values.fileName);

				case "{owner}":
					return escapeHtml(values.owner);

				case "{version}":
					return escapeHtml(values.version);

				case "{date}":
					return escapeHtml(values.date);

				default:
					return escapeHtml(part);
			}
		})
		.join("");
}

function hasAnyTemplateText(...values: string[]): boolean {
	return values.some((value) => value.trim().length > 0);
}

function extractHtmlTitle(html: string): string | undefined {
	const match = html.match(/<title>(.*?)<\/title>/is);

	if (!match) {
		return undefined;
	}

	return decodeHtml(match[1].trim());
}

function decodeHtml(value: string): string {
	return value
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#039;", "'");
}

function escapeHtml(value: string): string {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function sanitizeCssSize(value: string): string {
	const trimmed = value.trim();

	if (/^\d+(\.\d+)?(px|pt|mm|rem|em)$/.test(trimmed)) {
		return trimmed;
	}

	return "12px";
}

function sanitizeFontWeight(value: string): string {
	const trimmed = value.trim();

	if (/^(100|200|300|400|500|600|700|800|900|normal|bold)$/.test(trimmed)) {
		return trimmed;
	}

	return "400";
}