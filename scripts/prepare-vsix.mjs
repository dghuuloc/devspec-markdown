import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const coreDir = path.join(rootDir, "packages", "core");
const extensionDir = path.join(rootDir, "packages", "vscode-extension");

const targetCoreDir = path.join(
    extensionDir,
    "node_modules",
    "@devspec-markdown",
    "core"
);

copyDirectory(path.join(coreDir, "dist"), path.join(targetCoreDir, "dist"));
copyDirectory(path.join(coreDir, "vendor"), path.join(targetCoreDir, "vendor"));
copyFile(path.join(coreDir, "package.json"), path.join(targetCoreDir, "package.json"));

console.log("Prepared @devspec-markdown/core for VSIX packaging.");
console.log(targetCoreDir);

function copyDirectory(source, target) {
    if (!fs.existsSync(source)) {
        throw new Error(`Source folder not found: ${source}`);
    }

    fs.rmSync(target, {
        recursive: true,
        force: true
    });

    fs.mkdirSync(target, {
        recursive: true
    });

    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);

        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
    }
}

function copyFile(source, target) {
    if (!fs.existsSync(source)) {
        throw new Error(`Source file not found: ${source}`);
    }

    fs.mkdirSync(path.dirname(target), {
        recursive: true
    });

    fs.copyFileSync(source, target);
}