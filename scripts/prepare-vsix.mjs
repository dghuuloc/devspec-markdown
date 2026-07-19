import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();

const coreDir = path.join(rootDir, "packages", "core");
const extensionDir = path.join(rootDir, "packages", "vscode-extension");

const buildDir = path.join(rootDir, "build");

const stageDir = path.join(
    os.tmpdir(),
    `devspec-markdown-vsix-stage-${process.pid}`
);

const outputDir = path.join(buildDir, "vsix");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const vsceCmd = process.platform === "win32" ? "vsce.cmd" : "vsce";

const corePackageJson = JSON.parse(
    fs.readFileSync(path.join(coreDir, "package.json"), "utf8")
);

const extensionPackageJson = JSON.parse(
    fs.readFileSync(path.join(extensionDir, "package.json"), "utf8")
);

if (extensionPackageJson.scripts) {
    delete extensionPackageJson.scripts["vscode:prepublish"];
}

if (
    !extensionPackageJson.publisher ||
    extensionPackageJson.publisher === "your-publisher-name"
) {
    throw new Error(
        "Please set packages/vscode-extension/package.json publisher to your real publisher, for example: dghuuloc"
    );
}

fs.rmSync(stageDir, { recursive: true, force: true });
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

copyDirectory(path.join(extensionDir, "out"), path.join(stageDir, "out"));

copyIfExists(path.join(extensionDir, "README.md"), path.join(stageDir, "README.md"));
copyIfExists(path.join(extensionDir, "CHANGELOG.md"), path.join(stageDir, "CHANGELOG.md"));
copyIfExists(path.join(extensionDir, "LICENSE"), path.join(stageDir, "LICENSE"));

ensureRequiredTextFile(
    path.join(stageDir, "README.md"),
    "# DevSpec Markdown\n\nLocal VSIX package for DevSpec Markdown.\n"
);

ensureRequiredTextFile(
    path.join(stageDir, "CHANGELOG.md"),
    "# Changelog\n\n## 0.0.1\n\n- Initial local VSIX package.\n"
);

ensureRequiredTextFile(
    path.join(stageDir, "LICENSE"),
    "MIT License\n\nCopyright (c) 2026 dghuuloc\n"
);

/**
 * Stage install package.
 *
 * Important:
 * Do not install @devspec-markdown/core from npm registry.
 * We install only public runtime dependencies first.
 * Then we manually copy local core into node_modules.
 */
const publicRuntimeDependencies = {
    ...(extensionPackageJson.dependencies ?? {}),
    ...(corePackageJson.dependencies ?? {})
};

delete publicRuntimeDependencies["@devspec-markdown/core"];
delete publicRuntimeDependencies["mermaid"];
delete publicRuntimeDependencies["@vscode/vsce"];
delete publicRuntimeDependencies["typescript"];
delete publicRuntimeDependencies["@types/node"];
delete publicRuntimeDependencies["@types/vscode"];

const installPackageJson = {
    ...extensionPackageJson,
    private: true,
    dependencies: publicRuntimeDependencies,
    devDependencies: {}
};

delete installPackageJson.workspaces;

fs.writeFileSync(
    path.join(stageDir, "package.json"),
    `${JSON.stringify(installPackageJson, null, 2)}\n`,
    "utf8"
);

run(
    npmCmd,
    [
        "install",
        "--omit=dev",
        "--ignore-scripts",
        "--package-lock=false",
        "--no-audit",
        "--no-fund"
    ],
    stageDir
);

/**
 * Copy local core after npm install.
 */
const stagedCoreDir = path.join(
    stageDir,
    "node_modules",
    "@devspec-markdown",
    "core"
);

fs.rmSync(stagedCoreDir, { recursive: true, force: true });
fs.mkdirSync(stagedCoreDir, { recursive: true });

copyDirectory(path.join(coreDir, "dist"), path.join(stagedCoreDir, "dist"));
copyDirectory(path.join(coreDir, "vendor"), path.join(stagedCoreDir, "vendor"));

const stagedCoreDependencies = {
    ...(corePackageJson.dependencies ?? {})
};

delete stagedCoreDependencies["mermaid"];

const stagedCorePackageJson = {
    name: corePackageJson.name,
    version: corePackageJson.version,
    description: corePackageJson.description,
    type: corePackageJson.type,
    main: corePackageJson.main,
    types: corePackageJson.types,
    dependencies: stagedCoreDependencies
};

fs.writeFileSync(
    path.join(stagedCoreDir, "package.json"),
    `${JSON.stringify(stagedCorePackageJson, null, 2)}\n`,
    "utf8"
);

copyDirectory(
    path.join(extensionDir, "images"),
    path.join(stageDir, "images")
);

copyDirectoryIfExists(
    path.join(extensionDir, "media"),
    path.join(stageDir, "media")
);

copyDirectoryIfExists(
    path.join(extensionDir, "snippets"),
    path.join(stageDir, "snippets")
);

/**
 * Final package.json for vsce.
 *
 * Now @devspec-markdown/core is a normal version dependency.
 * npm list will accept it because node_modules/@devspec-markdown/core/package.json
 * has the same version.
 */
const finalPackageJson = {
    ...extensionPackageJson,
    dependencies: {
        ...publicRuntimeDependencies,
        "@devspec-markdown/core": corePackageJson.version
    },
    devDependencies: {},
    files: [
        "out/**",
        "node_modules/**",
        "images/**",
        "media/**",
        "snippets/**",
        "README.md",
        "CHANGELOG.md",
        "LICENSE",
        "package.json"
    ]
};

delete finalPackageJson.workspaces;

fs.writeFileSync(
    path.join(stageDir, "package.json"),
    `${JSON.stringify(finalPackageJson, null, 2)}\n`,
    "utf8"
);

fs.rmSync(path.join(stageDir, ".vscodeignore"), {
    force: true
});

prunePackageForVsix(path.join(stageDir, "node_modules"));
prunePackageForVsix(path.join(stageDir, "out"));
prunePackageForVsix(path.join(stageDir, "media"));

console.log("Pruning completed.");

console.log("");
console.log("Packaging VSIX...");

run(vsceCmd, ["package", "--no-yarn"], stageDir);

const vsixFile = fs.readdirSync(stageDir).find((file) => file.endsWith(".vsix"));

if (!vsixFile) {
    throw new Error(`VSIX file was not generated in ${stageDir}`);
}

const sourceVsix = path.join(stageDir, vsixFile);
const targetVsix = path.join(outputDir, vsixFile);

fs.copyFileSync(sourceVsix, targetVsix);

console.log("");
console.log("VSIX package created:");
console.log(targetVsix);

function run(command, args, cwd) {
    console.log("");
    console.log(`> ${command} ${args.join(" ")}`);
    console.log(`  cwd: ${cwd}`);

    const result = process.platform === "win32"
        ? spawnSync(
            "cmd.exe",
            ["/d", "/s", "/c", command, ...args],
            {
                cwd,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"]
            }
        )
        : spawnSync(command, args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        });

    if (result.stdout) {
        console.log(result.stdout);
    }

    if (result.stderr) {
        console.error(result.stderr);
    }

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }
}

function copyDirectory(source, target) {
    if (!fs.existsSync(source)) {
        throw new Error(`Source folder not found: ${source}`);
    }

    fs.mkdirSync(target, { recursive: true });

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

function copyDirectoryIfExists(source, target) {
    if (!fs.existsSync(source)) {
        return;
    }

    copyDirectory(source, target);
}

function copyIfExists(source, target) {
    if (!fs.existsSync(source)) {
        return;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function ensureRequiredTextFile(filePath, content) {
    if (fs.existsSync(filePath)) {
        return;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
}

function prunePackageForVsix(directory) {
    if (!fs.existsSync(directory)) {
        return;
    }

    const removableDirectoryNames = new Set([
        "test",
        "tests",
        "__tests__",
        "coverage",
        "docs",
        "doc",
        "example",
        "examples",
        "benchmark",
        "benchmarks",
        ".github",
        ".vscode"
    ]);

    const removableFileNames = new Set([
        ".DS_Store",
        "tsconfig.json",
        "tsconfig.tsbuildinfo",
        "jest.config.js",
        "jest.config.ts",
        "vitest.config.js",
        "vitest.config.ts",
        "rollup.config.js",
        "webpack.config.js"
    ]);

    const removableFileExtensions = [
        ".map",
        ".tsbuildinfo",
        ".md",
        ".markdown",
        ".ts",
        ".tsx",
        ".mts",
        ".cts"
    ];

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            if (removableDirectoryNames.has(entry.name)) {
                fs.rmSync(entryPath, { recursive: true, force: true });
                continue;
            }

            prunePackageForVsix(entryPath);
            continue;
        }

        if (removableFileNames.has(entry.name)) {
            fs.rmSync(entryPath, { force: true });
            continue;
        }

        if (removableFileExtensions.some((extension) => entry.name.endsWith(extension))) {
            fs.rmSync(entryPath, { force: true });
        }
    }
}