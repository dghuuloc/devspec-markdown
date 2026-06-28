export interface KatexCompletionEntry {
	label: string;
	insertText: string;
	detail: string;
	documentation: string;
}

export const KATEX_COMPLETIONS: KatexCompletionEntry[] = [
	{
		label: "frac",
		insertText: "\\frac{${1:numerator}}{${2:denominator}}$0",
		detail: "KaTeX fraction",
		documentation: "Insert a compact fraction: \\frac{a}{b}."
	},
	{
		label: "dfrac",
		insertText: "\\dfrac{${1:numerator}}{${2:denominator}}$0",
		detail: "KaTeX display-style fraction",
		documentation: "Insert a larger display-style fraction. Useful for inline readable fractions."
	},
	{
		label: "sqrt",
		insertText: "\\sqrt{${1:x}}$0",
		detail: "KaTeX square root",
		documentation: "Insert a square root."
	},
	{
		label: "sum",
		insertText: "\\sum_{${1:i=1}}^{${2:n}} ${3:a_i}$0",
		detail: "KaTeX summation",
		documentation: "Insert summation notation."
	},
	{
		label: "int",
		insertText: "\\int_{${1:0}}^{${2:1}} ${3:f(x)} \\, dx$0",
		detail: "KaTeX integral",
		documentation: "Insert a definite integral."
	},
	{
		label: "lim",
		insertText: "\\lim_{${1:x \\to 0}} ${2:f(x)}$0",
		detail: "KaTeX limit",
		documentation: "Insert a limit expression."
	},
	{
		label: "alpha",
		insertText: "\\alpha",
		detail: "Greek letter alpha",
		documentation: "Insert \\alpha."
	},
	{
		label: "beta",
		insertText: "\\beta",
		detail: "Greek letter beta",
		documentation: "Insert \\beta."
	},
	{
		label: "gamma",
		insertText: "\\gamma",
		detail: "Greek letter gamma",
		documentation: "Insert \\gamma."
	},
	{
		label: "theta",
		insertText: "\\theta",
		detail: "Greek letter theta",
		documentation: "Insert \\theta."
	},
	{
		label: "lambda",
		insertText: "\\lambda",
		detail: "Greek letter lambda",
		documentation: "Insert \\lambda."
	},
	{
		label: "pi",
		insertText: "\\pi",
		detail: "Greek letter pi",
		documentation: "Insert \\pi."
	},
	{
		label: "sigma",
		insertText: "\\sigma",
		detail: "Greek letter sigma",
		documentation: "Insert \\sigma."
	},
	{
		label: "aligned",
		insertText: "\\begin{aligned}\n${1:f(x)} &= ${2:x^2 + 2x + 1} \\\\\n&= ${3:(x + 1)^2}\n\\end{aligned}$0",
		detail: "KaTeX aligned environment",
		documentation: "Insert an aligned equation block. Use inside $$ ... $$."
	},
	{
		label: "bmatrix",
		insertText: "\\begin{bmatrix}\n${1:1} & ${2:2} \\\\\n${3:3} & ${4:4}\n\\end{bmatrix}$0",
		detail: "KaTeX matrix environment",
		documentation: "Insert a bracketed matrix. Use inside $$ ... $$."
	},
	{
		label: "cases",
		insertText: "\\begin{cases}\n${1:x^2}, & ${2:x \\ge 0} \\\\\n${3:-x}, & ${4:x < 0}\n\\end{cases}$0",
		detail: "KaTeX cases environment",
		documentation: "Insert a piecewise function."
	}
];
