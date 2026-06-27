const fs = require("fs");
const path = require("path");

const extensionRoot = path.resolve(__dirname, "..");
const mediaDir = path.join(extensionRoot, "media");
const target = path.join(mediaDir, "mermaid.min.js");

fs.mkdirSync(mediaDir, { recursive: true });

let source;

try {
	source = require.resolve("mermaid/dist/mermaid.min.js");
} catch {
	console.error("[copy-mermaid] Mermaid is not installed.");
	console.error("");
	console.error("Run this from repository root first:");
	console.error("");
	console.error("  npm install");
	console.error("");
	process.exit(1);
}

fs.copyFileSync(source, target);

console.log("[copy-mermaid] copied Mermaid:");
console.log(`  from: ${source}`);
console.log(`  to:   ${target}`);