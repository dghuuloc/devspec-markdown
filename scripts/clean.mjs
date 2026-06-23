import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "build",
  "packages/core/dist",
  "packages/cli/dist",
  "packages/vscode-extension/out"
];

for (const target of targets) {
  const fullPath = path.join(root, target);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`removed ${target}`);
  }
}
