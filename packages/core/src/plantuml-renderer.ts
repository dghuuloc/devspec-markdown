import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface PlantUmlOptions {
  jarPath?: string;
  securityProfile?: "SECURE" | "UNSECURE";
  cwd?: string;

  /**
   * true = force PlantUML render, usually initial preview, save, export.
   * false = reuse cache when possible.
   */
  force?: boolean;

  /**
   * true = if diagram is not cached, do not start Java.
   * Use this while typing to keep live preview fast.
   */
  skipIfUncached?: boolean;
}

const plantUmlSvgCache = new Map<string, string>();

export function normalizePlantUmlSource(source: string): string {
  let text = source.trim();

  if (!text) {
    return "";
  }

  if (!/@startuml\b/i.test(text)) {
    text = `@startuml\n${text}`;
  }

  if (!/@enduml\b/i.test(text)) {
    text = `${text}\n@enduml`;
  }

  return `${text.trim()}\n`;
}

export function renderPlantUmlToSvg(source: string, options: PlantUmlOptions = {}): string {
  const normalizedSource = normalizePlantUmlSource(source);
  const cacheKey = createPlantUmlCacheKey(normalizedSource, options);

  if (!options.force && plantUmlSvgCache.has(cacheKey)) {
    return plantUmlSvgCache.get(cacheKey)!;
  }

  if (options.skipIfUncached) {
    return createPlantUmlCachedPlaceholder(normalizedSource);
  }

  const jarPath = resolvePlantUmlJarPath(options.jarPath);
  const securityProfile = options.securityProfile ?? "SECURE";

  if (!jarPath) {
    return `
<div class="plantuml-error">
  <strong>PlantUML preview is not configured.</strong>
  <p>Run <code>npm run download:plantuml</code>, or set <code>devspecMarkdown.plantumlJarPath</code> in VS Code settings.</p>
  <pre><code>${escapeHtml(normalizedSource)}</code></pre>
</div>
`;
  }

  const result = spawnSync(
    "java",
    [
      "-Djava.awt.headless=true",
      `-DPLANTUML_SECURITY_PROFILE=${securityProfile}`,
      "-jar",
      jarPath,
      "-tsvg",
      "-pipe"
    ],
    {
      cwd: options.cwd ?? process.cwd(),
      input: normalizedSource,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024
    }
  );

  if (result.error) {
    return `
<div class="plantuml-error">
  <strong>PlantUML failed.</strong>
  <p>Java may not be installed or not available in PATH.</p>
  <pre><code>${escapeHtml(result.error.message)}</code></pre>
</div>
`;
  }

  if (result.status !== 0) {
    return `
<div class="plantuml-error">
  <strong>PlantUML returned exit code ${result.status}.</strong>
  <pre><code>${escapeHtml(result.stderr || result.stdout)}</code></pre>
</div>
`;
  }

  plantUmlSvgCache.set(cacheKey, result.stdout);
  return result.stdout;
}

function createPlantUmlCacheKey(source: string, options: PlantUmlOptions): string {
  const hash = crypto.createHash("sha1");

  hash.update(source);
  hash.update("\n");
  hash.update(options.securityProfile ?? "SECURE");
  hash.update("\n");
  hash.update(options.cwd ?? process.cwd());

  return hash.digest("hex");
}

function createPlantUmlCachedPlaceholder(source: string): string {
  return `
<div class="plantuml-error plantuml-pending">
  <strong>PlantUML preview is waiting for save.</strong>
  <p>Diagram rendering is skipped while typing to keep live preview fast. Save the file to refresh this diagram.</p>
  <details>
    <summary>Show PlantUML source</summary>
    <pre><code>${escapeHtml(source)}</code></pre>
  </details>
</div>
`;
}

function resolvePlantUmlJarPath(inputJarPath?: string): string | undefined {
  if (inputJarPath && fs.existsSync(inputJarPath)) {
    return inputJarPath;
  }

  const candidates = [
    // Runtime after TypeScript compile:
    // packages/core/dist/plantuml-renderer.js -> packages/core/vendor/plantuml.jar
    path.resolve(__dirname, "../vendor/plantuml.jar"),

    // Runtime from source during tests/tools:
    // packages/core/src/plantuml-renderer.ts -> packages/core/vendor/plantuml.jar
    path.resolve(__dirname, "../../vendor/plantuml.jar"),

    // Fallback from monorepo root:
    path.resolve(process.cwd(), "packages/core/vendor/plantuml.jar")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
