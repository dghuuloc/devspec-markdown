import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import * as nodeProcess from "process";

type DependencyId =
    | "java"
    | "freetype"
    | "fontconfig"
    | "fonts"
    | "graphviz"
    | "browser";

interface DependencyStatus {
    id: DependencyId;
    name: string;
    ok: boolean;
    details: string;
}

interface OsInfo {
    platform: NodeJS.Platform;
    id: string;
    idLike: string[];
    prettyName: string;
}

interface InstallPlan {
    manager: string;
    command: string;
    packages: string[];
    notes: string[];
}

const PROMPT_DISABLED_KEY = "devspecMarkdown.dependenciesPromptDisabled";
const LAST_PROMPT_TIME_KEY = "devspecMarkdown.dependenciesLastPromptTime";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function maybePromptForMissingDependencies(
    context: vscode.ExtensionContext
): Promise<void> {
    const config = vscode.workspace.getConfiguration("devspecMarkdown");
    const autoCheck = config.get<boolean>("autoCheckDependencies") ?? true;

    if (!autoCheck) {
        return;
    }

    const disabled = context.globalState.get<boolean>(PROMPT_DISABLED_KEY) ?? false;

    if (disabled) {
        return;
    }

    const lastPromptTime = context.globalState.get<number>(LAST_PROMPT_TIME_KEY) ?? 0;

    if (Date.now() - lastPromptTime < ONE_DAY_MS) {
        return;
    }

    const summary = checkDevSpecDependencies();

    if (summary.missing.length === 0) {
        return;
    }

    const osInfo = getOsInfo();
    const installPlan = createInstallPlan(osInfo, summary.missing);

    const installLabel = "Install Dependencies";
    const detailsLabel = "Show Details";
    const neverLabel = "Don't Show Again";

    const missingNames = summary.missing.map((item) => item.name).join(", ");

    const message = installPlan
        ? `DevSpec Markdown needs additional dependencies on ${osInfo.prettyName}: ${missingNames}.`
        : `DevSpec Markdown found missing dependencies on ${osInfo.prettyName}: ${missingNames}. Automatic installation is not supported for this environment.`;

    const result = await vscode.window.showInformationMessage(
        message,
        ...(installPlan ? [installLabel, detailsLabel, neverLabel] : [detailsLabel, neverLabel])
    );

    await context.globalState.update(LAST_PROMPT_TIME_KEY, Date.now());

    if (result === installLabel) {
        installMissingDependencies();
        return;
    }

    if (result === detailsLabel) {
        await showDependencyStatus();
        return;
    }

    if (result === neverLabel) {
        await context.globalState.update(PROMPT_DISABLED_KEY, true);
    }
}

export async function showDependencyStatus(): Promise<void> {
    const osInfo = getOsInfo();
    const summary = checkDevSpecDependencies();
    const installPlan = createInstallPlan(osInfo, summary.missing);

    const lines = [
        "# DevSpec Markdown Dependency Check",
        "",
        `Environment: ${vscode.env.remoteName ?? "local"}`,
        `Platform: ${osInfo.platform}`,
        `Distribution: ${osInfo.prettyName}`,
        `ID: ${osInfo.id || "n/a"}`,
        `ID_LIKE: ${osInfo.idLike.length > 0 ? osInfo.idLike.join(" ") : "n/a"}`,
        "",
        "## Status",
        "",
        ...summary.items.map((item) => {
            const mark = item.ok ? "✅" : "❌";
            return `- ${mark} **${item.name}**: ${item.details}`;
        }),
        "",
        "## Install Command",
        ""
    ];

    if (summary.missing.length === 0) {
        lines.push("All required dependencies are available.");
    } else if (installPlan) {
        lines.push(
            `Package manager: ${installPlan.manager}`,
            "",
            "```bash",
            installPlan.command,
            "```",
            "",
            "## Notes",
            "",
            ...installPlan.notes.map((note) => `- ${note}`)
        );
    } else {
        lines.push(
            "Automatic installation is not supported for this environment.",
            "",
            "Please install equivalent packages manually:",
            "",
            "- Java runtime",
            "- FreeType",
            "- Fontconfig",
            "- DejaVu or equivalent fonts",
            "- Noto CJK or equivalent fonts",
            "- Graphviz",
            "- Chromium, Chrome, Edge, or Brave"
        );
    }

    const document = await vscode.workspace.openTextDocument({
        content: lines.join("\n"),
        language: "markdown"
    });

    await vscode.window.showTextDocument(document);
}

export function installMissingDependencies(): void {
    const osInfo = getOsInfo();
    const summary = checkDevSpecDependencies();

    if (summary.missing.length === 0) {
        vscode.window.showInformationMessage("DevSpec Markdown dependencies are already installed.");
        return;
    }

    const installPlan = createInstallPlan(osInfo, summary.missing);

    if (!installPlan) {
        vscode.window.showErrorMessage(
            `DevSpec Markdown cannot automatically install dependencies on ${osInfo.prettyName}. Run "DevSpec: Check System Dependencies" for details.`
        );
        return;
    }

    const terminalOptions: vscode.TerminalOptions = {
        name: "DevSpec Dependencies"
    };

    if (nodeProcess.platform === "win32") {
        terminalOptions.shellPath = "powershell.exe";
    }

    const terminal = vscode.window.createTerminal(terminalOptions);
    terminal.show();
    terminal.sendText(installPlan.command, true);
}

export async function resetDependencyPrompt(
    context: vscode.ExtensionContext
): Promise<void> {
    await context.globalState.update(PROMPT_DISABLED_KEY, false);
    await context.globalState.update(LAST_PROMPT_TIME_KEY, 0);

    vscode.window.showInformationMessage("DevSpec Markdown dependency prompt has been reset.");
}

export function checkDevSpecDependencies(): {
    items: DependencyStatus[];
    missing: DependencyStatus[];
} {
    const osInfo = getOsInfo();
    const items: DependencyStatus[] = [];

    items.push(checkJava());

    if (osInfo.platform === "linux") {
        items.push(checkFreetype());
        items.push(checkFontconfig());
        items.push(checkFonts());
    }

    items.push(checkGraphviz());
    items.push(checkBrowser(osInfo));

    return {
        items,
        missing: items.filter((item) => !item.ok)
    };
}

function checkJava(): DependencyStatus {
    const ok = commandExists("java");

    return {
        id: "java",
        name: "Java runtime",
        ok,
        details: ok ? "java command found" : "java command not found"
    };
}

function checkFreetype(): DependencyStatus {
    const ok =
        linuxLibraryExists("libfreetype.so.6") ||
        linuxPackageInstalled("libfreetype6") ||
        linuxPackageInstalled("freetype") ||
        linuxPackageInstalled("freetype2");

    return {
        id: "freetype",
        name: "FreeType",
        ok,
        details: ok
            ? "FreeType library found"
            : "missing libfreetype.so.6; Java/PlantUML font rendering may fail"
    };
}

function checkFontconfig(): DependencyStatus {
    const ok = commandExists("fc-list") || linuxPackageInstalled("fontconfig");

    return {
        id: "fontconfig",
        name: "Fontconfig",
        ok,
        details: ok ? "fontconfig found" : "fontconfig not found"
    };
}

function checkFonts(): DependencyStatus {
    const ok =
        commandExists("fc-match") ||
        linuxPackageInstalled("fonts-dejavu-core") ||
        linuxPackageInstalled("dejavu-sans-fonts") ||
        linuxPackageInstalled("ttf-dejavu");

    return {
        id: "fonts",
        name: "Fonts",
        ok,
        details: ok ? "basic fonts found" : "recommended fonts not found"
    };
}

function checkGraphviz(): DependencyStatus {
    const ok = commandExists("dot");

    return {
        id: "graphviz",
        name: "Graphviz",
        ok,
        details: ok ? "dot command found" : "dot command not found"
    };
}

function checkBrowser(osInfo: OsInfo): DependencyStatus {
    const ok = browserExists(osInfo);

    return {
        id: "browser",
        name: "Chromium-based browser",
        ok,
        details: ok
            ? "Chromium, Chrome, Edge, or Brave found"
            : "Chromium, Chrome, Edge, or Brave not found; PDF export may fail"
    };
}

function createInstallPlan(
    osInfo: OsInfo,
    missing: DependencyStatus[]
): InstallPlan | undefined {
    if (missing.length === 0) {
        return undefined;
    }

    if (osInfo.platform === "win32") {
        return createWindowsInstallPlan(missing);
    }

    if (osInfo.platform === "darwin") {
        return createMacInstallPlan(missing);
    }

    if (osInfo.platform !== "linux") {
        return undefined;
    }

    const ids = [osInfo.id, ...osInfo.idLike];

    if (ids.some((id) => ["debian", "ubuntu"].includes(id))) {
        return createDebianInstallPlan(osInfo, missing);
    }

    if (osInfo.id === "amzn") {
        return createAmazonLinuxInstallPlan(missing);
    }

    if (ids.some((id) => ["fedora", "rhel", "centos", "rocky", "almalinux"].includes(id))) {
        return createGenericDnfInstallPlan(missing);
    }

    if (ids.includes("alpine")) {
        return createAlpineInstallPlan(missing);
    }

    if (ids.some((id) => ["arch", "manjaro"].includes(id))) {
        return createArchInstallPlan(missing);
    }

    if (ids.some((id) => ["opensuse", "suse", "sles"].includes(id))) {
        return createSuseInstallPlan(missing);
    }

    return undefined;
}

function createDebianInstallPlan(
    osInfo: OsInfo,
    missing: DependencyStatus[]
): InstallPlan {
    const requiredPackages: string[] = [];
    const optionalPackages: string[] = [];

    if (hasMissing(missing, "java")) {
        requiredPackages.push("default-jre-headless");
    }

    if (hasMissing(missing, "freetype")) {
        requiredPackages.push("libfreetype6");
    }

    if (hasMissing(missing, "fontconfig")) {
        requiredPackages.push("fontconfig");
    }

    if (hasMissing(missing, "fonts")) {
        requiredPackages.push("fonts-dejavu-core", "fonts-noto-cjk");
    }

    if (hasMissing(missing, "graphviz")) {
        requiredPackages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        if (osInfo.id === "ubuntu") {
            optionalPackages.push("chromium-browser", "chromium");
        } else {
            optionalPackages.push("chromium");
        }
    }

    return {
        manager: "apt-get",
        packages: [...requiredPackages, ...optionalPackages],
        command: createAptInstallCommand(requiredPackages, optionalPackages),
        notes: [
            "Used for Debian and Ubuntu based environments.",
            "Browser packages are treated as optional because some Ubuntu images provide Chromium through Snap or omit it from apt repositories."
        ]
    };
}

function createAmazonLinuxInstallPlan(missing: DependencyStatus[]): InstallPlan {
    const requiredPackages: string[] = [];
    const optionalPackages: string[] = [];

    if (hasMissing(missing, "java")) {
        requiredPackages.push("java-17-amazon-corretto-headless");
    }

    if (hasMissing(missing, "freetype")) {
        requiredPackages.push("freetype");
    }

    if (hasMissing(missing, "fontconfig")) {
        requiredPackages.push("fontconfig");
    }

    if (hasMissing(missing, "fonts")) {
        requiredPackages.push("dejavu-sans-fonts");
        optionalPackages.push("google-noto-cjk-fonts");
    }

    if (hasMissing(missing, "graphviz")) {
        requiredPackages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        optionalPackages.push("chromium");
    }

    return {
        manager: "dnf",
        packages: [...requiredPackages, ...optionalPackages],
        command: createDnfInstallCommand(requiredPackages, optionalPackages),
        notes: [
            "Used for Amazon Linux 2023 when /etc/os-release has ID=amzn.",
            "Amazon Linux 2023 uses dnf.",
            "Chromium may not be available in every Amazon Linux 2023 repository, so it is installed only if available.",
            "If browser installation is skipped, install Chrome/Chromium manually or set devspecMarkdown.browserPath."
        ]
    };
}

function createGenericDnfInstallPlan(missing: DependencyStatus[]): InstallPlan {
    const requiredPackages: string[] = [];
    const optionalPackages: string[] = [];

    if (hasMissing(missing, "java")) {
        requiredPackages.push("java-17-openjdk-headless");
    }

    if (hasMissing(missing, "freetype")) {
        requiredPackages.push("freetype");
    }

    if (hasMissing(missing, "fontconfig")) {
        requiredPackages.push("fontconfig");
    }

    if (hasMissing(missing, "fonts")) {
        requiredPackages.push("dejavu-sans-fonts");
        optionalPackages.push("google-noto-cjk-fonts");
    }

    if (hasMissing(missing, "graphviz")) {
        requiredPackages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        optionalPackages.push("chromium");
    }

    return {
        manager: commandExists("dnf") ? "dnf" : "yum",
        packages: [...requiredPackages, ...optionalPackages],
        command: createDnfInstallCommand(requiredPackages, optionalPackages),
        notes: [
            "Used for Fedora, RHEL, CentOS, Rocky Linux, and AlmaLinux style environments.",
            "Chromium is treated as optional because availability depends on enabled repositories."
        ]
    };
}

function createAlpineInstallPlan(missing: DependencyStatus[]): InstallPlan {
    const packages: string[] = [];

    if (hasMissing(missing, "java")) {
        packages.push("openjdk17-jre-headless");
    }

    if (hasMissing(missing, "freetype")) {
        packages.push("freetype");
    }

    if (hasMissing(missing, "fontconfig")) {
        packages.push("fontconfig");
    }

    if (hasMissing(missing, "fonts")) {
        packages.push("ttf-dejavu", "noto-fonts-cjk");
    }

    if (hasMissing(missing, "graphviz")) {
        packages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        packages.push("chromium");
    }

    return {
        manager: "apk",
        packages,
        command: createApkInstallCommand(packages),
        notes: ["Used for Alpine Linux environments."]
    };
}

function createArchInstallPlan(missing: DependencyStatus[]): InstallPlan {
    const packages: string[] = [];

    if (hasMissing(missing, "java")) {
        packages.push("jre-openjdk-headless");
    }

    if (hasMissing(missing, "freetype")) {
        packages.push("freetype2");
    }

    if (hasMissing(missing, "fontconfig")) {
        packages.push("fontconfig");
    }

    if (hasMissing(missing, "fonts")) {
        packages.push("ttf-dejavu", "noto-fonts-cjk");
    }

    if (hasMissing(missing, "graphviz")) {
        packages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        packages.push("chromium");
    }

    return {
        manager: "pacman",
        packages,
        command: createPacmanInstallCommand(packages),
        notes: ["Used for Arch Linux and Manjaro style environments."]
    };
}

function createSuseInstallPlan(missing: DependencyStatus[]): InstallPlan {
    const packages: string[] = [];

    if (hasMissing(missing, "java")) {
        packages.push("java-17-openjdk-headless");
    }

    if (hasMissing(missing, "freetype")) {
        packages.push("freetype2");
    }

    if (hasMissing(missing, "fontconfig")) {
        packages.push("fontconfig");
    }

    if (hasMissing(missing, "fonts")) {
        packages.push("dejavu-fonts", "noto-sans-cjk-fonts");
    }

    if (hasMissing(missing, "graphviz")) {
        packages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        packages.push("chromium");
    }

    return {
        manager: "zypper",
        packages,
        command: createZypperInstallCommand(packages),
        notes: ["Used for openSUSE and SUSE style environments."]
    };
}

function createWindowsInstallPlan(missing: DependencyStatus[]): InstallPlan | undefined {
    if (!commandExists("winget")) {
        return undefined;
    }

    const packageIds: string[] = [];

    if (hasMissing(missing, "java")) {
        packageIds.push("Microsoft.OpenJDK.17");
    }

    if (hasMissing(missing, "graphviz")) {
        packageIds.push("Graphviz.Graphviz");
    }

    if (hasMissing(missing, "browser")) {
        packageIds.push("Google.Chrome");
    }

    return {
        manager: "winget",
        packages: packageIds,
        command: createWingetInstallCommand(packageIds),
        notes: [
            "Used for local Windows environments.",
            "Windows does not need Linux packages such as libfreetype6 or fontconfig.",
            "After installing Java or Graphviz, reload VS Code so PATH changes are visible."
        ]
    };
}

function createMacInstallPlan(missing: DependencyStatus[]): InstallPlan | undefined {
    if (!commandExists("brew")) {
        return undefined;
    }

    const packages: string[] = [];
    const casks: string[] = [];

    if (hasMissing(missing, "java")) {
        casks.push("microsoft-openjdk@17");
    }

    if (hasMissing(missing, "graphviz")) {
        packages.push("graphviz");
    }

    if (hasMissing(missing, "browser")) {
        casks.push("google-chrome");
    }

    return {
        manager: "brew",
        packages: [...packages, ...casks],
        command: createBrewInstallCommand(packages, casks),
        notes: [
            "Used for macOS environments when Homebrew is available.",
            "After installing Java or Graphviz, reload VS Code so PATH changes are visible."
        ]
    };
}

function createAptInstallCommand(requiredPackages: string[], optionalPackages: string[]): string {
    return [
        "set -e",
        createSudoShellSnippet(),
        "$SUDO apt-get update",
        `REQUIRED_PACKAGES="${requiredPackages.join(" ")}"`,
        `OPTIONAL_PACKAGES="${optionalPackages.join(" ")}"`,
        "INSTALL_PACKAGES=\"$REQUIRED_PACKAGES\"",
        "for package_name in $OPTIONAL_PACKAGES; do if apt-cache show \"$package_name\" >/dev/null 2>&1 || dpkg-query -W \"$package_name\" >/dev/null 2>&1; then INSTALL_PACKAGES=\"$INSTALL_PACKAGES $package_name\"; else echo \"Skipping optional package because it is not available: $package_name\"; fi; done",
        "if [ -z \"$(echo $INSTALL_PACKAGES | xargs)\" ]; then echo \"No installable packages were selected.\"; exit 0; fi",
        "$SUDO apt-get install -y --no-install-recommends $INSTALL_PACKAGES",
        "$SUDO ldconfig || true",
        "echo \"DevSpec Markdown dependencies installed. Please reload VS Code if preview or PDF export still fails.\""
    ].join(" && ");
}

function createDnfInstallCommand(requiredPackages: string[], optionalPackages: string[]): string {
    const manager = commandExists("dnf") ? "dnf" : "yum";

    return [
        "set -e",
        createSudoShellSnippet(),
        `DNF="${manager}"`,
        "$SUDO $DNF makecache || true",
        `REQUIRED_PACKAGES="${requiredPackages.join(" ")}"`,
        `OPTIONAL_PACKAGES="${optionalPackages.join(" ")}"`,
        "INSTALL_PACKAGES=\"$REQUIRED_PACKAGES\"",
        "for package_name in $OPTIONAL_PACKAGES; do if $DNF list --available \"$package_name\" >/dev/null 2>&1 || rpm -q \"$package_name\" >/dev/null 2>&1; then INSTALL_PACKAGES=\"$INSTALL_PACKAGES $package_name\"; else echo \"Skipping optional package because it is not available: $package_name\"; fi; done",
        "if [ -z \"$(echo $INSTALL_PACKAGES | xargs)\" ]; then echo \"No installable packages were selected.\"; exit 0; fi",
        "$SUDO $DNF install -y $INSTALL_PACKAGES",
        "$SUDO ldconfig || true",
        "echo \"DevSpec Markdown dependencies installed. Please reload VS Code if preview or PDF export still fails.\""
    ].join(" && ");
}

function createApkInstallCommand(packages: string[]): string {
    return [
        "set -e",
        createSudoShellSnippet(),
        "if [ -z \"$(echo " + packages.join(" ") + " | xargs)\" ]; then echo \"No packages were selected.\"; exit 0; fi",
        `$SUDO apk add --no-cache ${packages.join(" ")}`,
        "echo \"DevSpec Markdown dependencies installed. Please reload VS Code if preview or PDF export still fails.\""
    ].join(" && ");
}

function createPacmanInstallCommand(packages: string[]): string {
    return [
        "set -e",
        createSudoShellSnippet(),
        "if [ -z \"$(echo " + packages.join(" ") + " | xargs)\" ]; then echo \"No packages were selected.\"; exit 0; fi",
        `$SUDO pacman -Sy --noconfirm ${packages.join(" ")}`,
        "$SUDO ldconfig || true",
        "echo \"DevSpec Markdown dependencies installed. Please reload VS Code if preview or PDF export still fails.\""
    ].join(" && ");
}

function createZypperInstallCommand(packages: string[]): string {
    return [
        "set -e",
        createSudoShellSnippet(),
        "if [ -z \"$(echo " + packages.join(" ") + " | xargs)\" ]; then echo \"No packages were selected.\"; exit 0; fi",
        `$SUDO zypper --non-interactive install ${packages.join(" ")}`,
        "$SUDO ldconfig || true",
        "echo \"DevSpec Markdown dependencies installed. Please reload VS Code if preview or PDF export still fails.\""
    ].join(" && ");
}

function createWingetInstallCommand(packageIds: string[]): string {
    if (packageIds.length === 0) {
        return "Write-Host \"No packages were selected.\"";
    }

    return packageIds
        .map(
            (packageId) =>
                `winget install --exact --id ${packageId} --accept-package-agreements --accept-source-agreements`
        )
        .concat('Write-Host "DevSpec Markdown dependencies installed. Please reload VS Code."')
        .join("; ");
}

function createBrewInstallCommand(packages: string[], casks: string[]): string {
    const commands: string[] = [];

    if (packages.length > 0) {
        commands.push(`brew install ${packages.join(" ")}`);
    }

    for (const cask of casks) {
        commands.push(`brew install --cask ${cask}`);
    }

    if (commands.length === 0) {
        return "echo \"No packages were selected.\"";
    }

    commands.push("echo \"DevSpec Markdown dependencies installed. Please reload VS Code.\"");

    return commands.join(" && ");
}

function createSudoShellSnippet(): string {
    return "if [ \"$(id -u)\" = \"0\" ]; then SUDO=\"\"; elif command -v sudo >/dev/null 2>&1; then SUDO=\"sudo\"; else echo \"sudo is required because this environment is not running as root.\"; exit 1; fi";
}

function hasMissing(missing: DependencyStatus[], id: DependencyId): boolean {
    return missing.some((item) => item.id === id);
}

function getOsInfo(): OsInfo {
    if (nodeProcess.platform === "win32") {
        return {
            platform: "win32",
            id: "windows",
            idLike: [],
            prettyName: "Windows"
        };
    }

    if (nodeProcess.platform === "darwin") {
        return {
            platform: "darwin",
            id: "macos",
            idLike: [],
            prettyName: "macOS"
        };
    }

    if (nodeProcess.platform !== "linux") {
        return {
            platform: nodeProcess.platform,
            id: nodeProcess.platform,
            idLike: [],
            prettyName: nodeProcess.platform
        };
    }

    if (!fs.existsSync("/etc/os-release")) {
        return {
            platform: "linux",
            id: "linux",
            idLike: [],
            prettyName: "Linux"
        };
    }

    const content = fs.readFileSync("/etc/os-release", "utf8");
    const values = new Map<string, string>();

    for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);

        if (!match) {
            continue;
        }

        values.set(match[1], unquoteOsReleaseValue(match[2]));
    }

    return {
        platform: "linux",
        id: (values.get("ID") ?? "linux").toLowerCase(),
        idLike: (values.get("ID_LIKE") ?? "")
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean),
        prettyName: values.get("PRETTY_NAME") ?? "Linux"
    };
}

function unquoteOsReleaseValue(value: string): string {
    const trimmed = value.trim();

    if (
        (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function browserExists(osInfo: OsInfo): boolean {
    if (
        commandExists("chromium") ||
        commandExists("chromium-browser") ||
        commandExists("google-chrome") ||
        commandExists("google-chrome-stable") ||
        commandExists("microsoft-edge") ||
        commandExists("microsoft-edge-stable") ||
        commandExists("brave-browser") ||
        commandExists("msedge") ||
        commandExists("chrome") ||
        commandExists("brave")
    ) {
        return true;
    }

    if (osInfo.platform === "win32") {
        return getWindowsBrowserCandidates().some((candidate) => fileExists(candidate));
    }

    if (osInfo.platform === "darwin") {
        return [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
        ].some((candidate) => fileExists(candidate));
    }

    return false;
}

function getWindowsBrowserCandidates(): string[] {
    const programFiles = nodeProcess.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = nodeProcess.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const localAppData =
        nodeProcess.env.LOCALAPPDATA ?? path.join(nodeProcess.env.USERPROFILE ?? "C:\\Users\\Default", "AppData", "Local");

    return [
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
    ];
}

function commandExists(command: string): boolean {
    const lookupCommand = nodeProcess.platform === "win32" ? "where.exe" : "which";

    const result = spawnSync(lookupCommand, [command], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
    });

    return !result.error && result.status === 0;
}

function linuxPackageInstalled(packageName: string): boolean {
    if (nodeProcess.platform !== "linux") {
        return false;
    }

    if (commandExists("dpkg-query")) {
        const result = spawnSync(
            "dpkg-query",
            ["-W", "-f=${Status}", packageName],
            {
                encoding: "utf8",
                windowsHide: true,
                stdio: ["ignore", "pipe", "ignore"]
            }
        );

        const stdout = result.stdout?.toString() ?? "";

        if (!result.error && result.status === 0 && stdout.includes("install ok installed")) {
            return true;
        }
    }

    if (commandExists("rpm")) {
        const result = spawnSync("rpm", ["-q", packageName], {
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"]
        });

        if (!result.error && result.status === 0) {
            return true;
        }
    }

    if (commandExists("apk")) {
        const result = spawnSync("apk", ["info", "-e", packageName], {
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"]
        });

        if (!result.error && result.status === 0) {
            return true;
        }
    }

    if (commandExists("pacman")) {
        const result = spawnSync("pacman", ["-Q", packageName], {
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"]
        });

        if (!result.error && result.status === 0) {
            return true;
        }
    }

    return false;
}

function linuxLibraryExists(libraryName: string): boolean {
    if (nodeProcess.platform !== "linux") {
        return false;
    }

    if (commandExists("ldconfig")) {
        const result = spawnSync("ldconfig", ["-p"], {
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"]
        });

        const stdout = result.stdout?.toString() ?? "";

        if (!result.error && result.status === 0 && stdout.includes(libraryName)) {
            return true;
        }
    }

    return [
        `/lib/x86_64-linux-gnu/${libraryName}`,
        `/usr/lib/x86_64-linux-gnu/${libraryName}`,
        `/usr/lib64/${libraryName}`,
        `/usr/lib/${libraryName}`,
        `/lib/${libraryName}`
    ].some((candidate) => fileExists(candidate));
}

function fileExists(candidate: string): boolean {
    try {
        return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
        return false;
    }
}