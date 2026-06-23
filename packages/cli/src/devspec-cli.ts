#!/usr/bin/env node
import path from "node:path";
import { buildHtmlFile, exportHtmlFileToPdf } from "@devspec-markdown/core";

interface Args {
  command: string;
  input?: string;
  output?: string;
  browser?: string;
  plantumlJar?: string;
  diagramSourceDir?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command || args.command === "help" || args.command === "--help") {
    printHelp();
    return;
  }

  if (args.command === "build") {
    if (!args.input || !args.output) {
      throw new Error("build requires --input and --output");
    }

    const invocationCwd = getInvocationCwd();

    const output = buildHtmlFile({
      inputFile: resolveCliPath(args.input, invocationCwd),
      outputFile: resolveCliPath(args.output, invocationCwd),
      baseDir: invocationCwd,
      diagramSourceDir: args.diagramSourceDir
        ? resolveCliPath(args.diagramSourceDir, invocationCwd)
        : path.resolve(invocationCwd, "docs/diagrams/src"),
      plantuml: {
        jarPath: args.plantumlJar
          ? resolveCliPath(args.plantumlJar, invocationCwd)
          : undefined,
        securityProfile: "SECURE"
      }
    });

    console.log(`HTML generated: ${output}`);
    return;
  }

  if (args.command === "pdf") {
    if (!args.input || !args.output || !args.browser) {
      throw new Error("pdf requires --input <html> --output <pdf> --browser <chrome-path>");
    }

    const invocationCwd = getInvocationCwd();

    const output = await exportHtmlFileToPdf({
      htmlFile: resolveCliPath(args.input, invocationCwd),
      outputFile: resolveCliPath(args.output, invocationCwd),
      browserPath: resolveCliPath(args.browser, invocationCwd)
    });

    console.log(`PDF generated: ${output}`);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

function getInvocationCwd(): string {
  const initCwd = process.env.INIT_CWD;

  if (initCwd && path.isAbsolute(initCwd)) {
    return initCwd;
  }

  return process.cwd();
}

function resolveCliPath(value: string, baseDir: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] ?? "help"
  };

  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) {
      continue;
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }

    switch (key) {
      case "--input":
        args.input = value;
        break;
      case "--output":
        args.output = value;
        break;
      case "--browser":
        args.browser = value;
        break;
      case "--plantuml-jar":
        args.plantumlJar = value;
        break;
      case "--diagram-source-dir":
        args.diagramSourceDir = value;
        break;
      default:
        throw new Error(`Unknown option: ${key}`);
    }

    i += 1;
  }

  return args;
}

function printHelp(): void {
  console.log(`DevSpec Markdown CLI

Usage:
  devspec build --input docs/templates/sample-devspec.md --output build/sample-devspec.html
  devspec build --input docs/templates/sample-devspec.md --output build/sample-devspec.html --plantuml-jar C:/tools/plantuml/plantuml.jar
  devspec pdf --input build/sample-devspec.html --output build/sample-devspec.pdf --browser "C:/Program Files/Google/Chrome/Application/chrome.exe"
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});