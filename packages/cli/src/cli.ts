#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import inquirer from "inquirer";
import { generateCem, type RunOptions, loadConfig, mergeConfig } from "@wc-toolkit/cem-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGIN_CHOICES = [
  { name: "lit", packageName: "@wc-toolkit/cem-generator-lit", factory: "litPlugin" },
  { name: "fast", packageName: "@wc-toolkit/cem-generator-fast", factory: "fastPlugin" },
  { name: "stencil", packageName: "@wc-toolkit/cem-generator-stencil", factory: "stencilPlugin" },
  { name: "preact", packageName: "@wc-toolkit/cem-generator-preact", factory: "preactPlugin" },
  { name: "vue", packageName: "@wc-toolkit/cem-generator-vue", factory: "vuePlugin" },
  { name: "solid", packageName: "@wc-toolkit/cem-generator-solid", factory: "solidPlugin" },
  { name: "svelte", packageName: "@wc-toolkit/cem-generator-svelte", factory: "sveltePlugin" },
] as const;

const INTEGRATION_CHOICES = [
  {
    name: "react-wrappers",
    packageName: "@wc-toolkit/react-wrappers",
    factory: "reactWrapperGeneratorPlugin",
    options: { stronglyTypedEvents: true },
  },
  {
    name: "jsx-types",
    packageName: "@wc-toolkit/jsx-types",
    factory: "jsxTypesGeneratorPlugin",
    options: { outdir: "./types", stronglyTypedEvents: true },
  },
  {
    name: "vuejs-types",
    packageName: "@wc-toolkit/vuejs-types",
    factory: "vuejsTypesGeneratorPlugin",
    options: { outdir: "./types", stronglyTypedEvents: true },
  },
  {
    name: "svelte-types",
    packageName: "@wc-toolkit/svelte-types",
    factory: "svelteTypesGeneratorPlugin",
    options: { outdir: "./types", stronglyTypedEvents: true },
  },
] as const;

const DEFAULT_SOURCE_INCLUDE = ["src/**/*.{ts,tsx,js,jsx}"];
const DEFAULT_SOURCE_EXCLUDE = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
  "**/dist/**",
  "**/node_modules/**",
];

type InitMode = "cli" | "code";

const program = new Command();

program
  .name("cem")
  .description("Custom Elements Manifest Generator")
  .version("0.1.0");

program
  .command("generate")
  .description("Generate a Custom Elements Manifest")
  .option("--tsconfig <path>", "Path to tsconfig.json", "./tsconfig.json")
  .option("-c, --config <path>", "Path to cem-generator config file (auto-detected if omitted)")
  .option("-o, --output <path>", "Output file path", "./custom-elements.json")
  .option("--include <patterns...>", "Glob patterns to include")
  .option("--exclude <patterns...>", "Glob patterns to exclude")
  .option("--no-inheritance", "Disable inheritance materialization")
  .option("--plugin <paths...>", "Additional plugin paths to load")
  .option("--conflict-policy <policy>", "Detector conflict policy: throw | last-wins", "last-wins")
  .option("--no-sort", "Disable alphabetical sorting of manifest entries")
  .option("--deprecated-last", "Move deprecated items to end of sorted lists")
  .option("--validate-exported-types <severity>", "Exported-type validation: off | warning | error")
  .option("--validation-invariants <severity>", "Manifest invariant validation: off | warning | error")
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      const { options: fileOptions, configPath } = await loadConfig({
        cwd,
        configPath: options.config,
      });

      const cliOptions: RunOptions = {
        tsConfigPath: path.resolve(options.tsconfig),
        include: options.include ?? getDefaultInclude(cwd),
        exclude: options.exclude ?? DEFAULT_SOURCE_EXCLUDE,
        sort: options.sort !== false,
      };

      if (options.deprecatedLast) {
        cliOptions.deprecatedLast = true;
      }

      if (options.validateExportedTypes) {
        if (!["off", "warning", "error"].includes(options.validateExportedTypes)) {
          throw new Error("--validate-exported-types must be one of: off, warning, error");
        }
        cliOptions.validation = { exportTypes: options.validateExportedTypes };
      }

      if (options.validationInvariants) {
        if (!["off", "warning", "error"].includes(options.validationInvariants)) {
          throw new Error("--validation-invariants must be one of: off, warning, error");
        }
        cliOptions.validation = {
          ...(cliOptions.validation ?? {}),
          invariants: options.validationInvariants,
        };
      }

      if (options.inheritance === false) {
        cliOptions.inheritance = false;
      }

      cliOptions.conflictPolicy = options.conflictPolicy as "throw" | "last-wins";

      const plugins: RunOptions["plugins"] = [];

      if (options.plugin && options.plugin.length > 0) {
        for (const pluginPath of options.plugin) {
          const resolvedPath = path.resolve(pluginPath);
          const pluginModule = await import(resolvedPath);
          const plugin = pluginModule.default ?? pluginModule;
          if (plugin) {
            plugins.push(plugin);
          }
        }
      }

      if (plugins.length > 0) {
        cliOptions.plugins = plugins;
      }

      const mergedOptions = mergeConfig(cliOptions, fileOptions);

      if (configPath) {
        console.log(`Using config file: ${configPath}`);
      }

      const manifest = generateCem(mergedOptions);

      const outputPath = path.resolve(options.output);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
      console.log(`Generated manifest at ${outputPath}`);
    } catch (error) {
      console.error("Error generating manifest:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Set up the CLI or code workflow for generating a Custom Elements Manifest")
  .option("-c, --config <path>", "Config file path", "./cem-generator.config.mjs")
  .option("--mode <mode>", "How to run the generator: cli | code")
  .option("--output <path>", "Generated code file path", "./generate-cem.ts")
  .option("--plugin <names...>", "Parser plugins to include (lit, fast, stencil, preact, vue, solid, svelte)")
  .option("--install", "Install selected plugin packages")
  .option("--yes", "Create a config without prompting for plugins")
  .option("--force", "Overwrite existing output files")
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      let mode: InitMode;
      let selectedNames: string[];
      let selectedIntegrationNames: string[];
      if (options.yes) {
        mode = options.mode ? validateInitMode(options.mode) : "cli";
        selectedNames = [];
        selectedIntegrationNames = [];
      } else if (options.mode) {
        mode = validateInitMode(options.mode);
        if (options.plugin) {
          selectedNames = validatePluginNames(options.plugin);
          selectedIntegrationNames = [];
        } else {
          ({ selectedNames, selectedIntegrationNames } = await promptForPluginsAndIntegrations());
        }
      } else {
        ({ mode, selectedNames, selectedIntegrationNames } = options.plugin
          ? await promptForModeAndPlugins(options.plugin)
          : await promptForModeAndPlugins());
      }
      const selectedPlugins = PLUGIN_CHOICES.filter((plugin) => selectedNames.includes(plugin.name));
      const selectedIntegrations = INTEGRATION_CHOICES.filter((integration) =>
        selectedIntegrationNames.includes(integration.name),
      );
      const generatorPackage = mode === "cli"
        ? "@wc-toolkit/cem-generator-cli"
        : "@wc-toolkit/cem-generator";
      const packagesToInstall = [
        generatorPackage,
        ...(mode === "code" ? ["tsx"] : []),
        ...selectedPlugins.map((plugin) => plugin.packageName),
        ...selectedIntegrations.map((integration) => integration.packageName),
      ];

      const configPath = path.resolve(options.config);
      const outputPath = path.resolve(options.output);
      const targetPaths = mode === "cli" ? [configPath] : [configPath, outputPath];
      const existingPath = targetPaths.find((targetPath) => fs.existsSync(targetPath));
      if (existingPath && !options.force) {
        throw new Error(`Output file already exists: ${existingPath}. Use --force to overwrite it.`);
      }

      const shouldInstall = options.install ?? (!options.yes && !options.mode
        ? await promptForInstall()
        : false);
      if (shouldInstall) {
        installPluginDependencies(packagesToInstall);
      }

      fs.writeFileSync(
        configPath,
        createConfigSource(selectedPlugins, selectedIntegrations, getDefaultInclude(cwd), DEFAULT_SOURCE_EXCLUDE),
        "utf-8",
      );
      console.log(`Created config file at ${configPath}`);
      if (mode === "code") {
        fs.writeFileSync(outputPath, createCodeSource(configPath, outputPath), "utf-8");
        console.log(`Created code file at ${outputPath}`);
      }
      printNextSteps(mode, configPath, outputPath);
    } catch (error) {
      console.error("Error initializing project:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function validateInitMode(mode: string): InitMode {
  if (mode !== "cli" && mode !== "code") {
    throw new Error(`Unknown mode: ${mode}. Choose either cli or code.`);
  }
  return mode;
}

function getDefaultInclude(cwd: string): string[] | undefined {
  return fs.existsSync(path.join(cwd, "src")) ? DEFAULT_SOURCE_INCLUDE : undefined;
}

async function promptForMode(prompt: readline.Interface): Promise<InitMode> {
  const answer = await prompt.question("How will you run the generator? (1) CLI (2) code: ");
  if (answer.trim() === "1" || answer.trim().toLowerCase() === "cli") return "cli";
  if (answer.trim() === "2" || answer.trim().toLowerCase() === "code") return "code";
  throw new Error("Invalid mode selection. Choose 1 for CLI or 2 for code.");
}

async function promptForModeAndPlugins(pluginNames?: string[]): Promise<{
  mode: InitMode;
  selectedNames: string[];
  selectedIntegrationNames: string[];
}> {
  if (pluginNames) {
    return {
      mode: await promptForModeWithInput(),
      selectedNames: validatePluginNames(pluginNames),
      selectedIntegrationNames: [],
    };
  }

  if (isInteractiveTerminal()) {
    return promptForInteractiveSelections();
  }

  const prompt = readline.createInterface({ input, output });
  const lines = prompt[Symbol.asyncIterator]();
  try {
    output.write("How will you run the generator? (1) CLI (2) code: ");
    const modeLine = await lines.next();
    if (modeLine.done) throw new Error("No mode selected.");
    const mode = validateInitMode(modeLine.value.trim() === "1" ? "cli" : modeLine.value.trim() === "2" ? "code" : modeLine.value.trim());

    console.log("Which framework plugins should be included?");
    PLUGIN_CHOICES.forEach((plugin, index) => console.log(`  ${index + 1}. ${plugin.name}`));
    console.log("Enter numbers separated by commas, or press Enter for vanilla only.");
    output.write("Plugins: ");
    const pluginsLine = await lines.next();
    if (pluginsLine.done) throw new Error("No plugin selection provided.");

    const selectedNames = parsePluginSelection(pluginsLine.value);

    console.log("Which project integrations should be included? (multi-select)");
    INTEGRATION_CHOICES.forEach((integration, index) => console.log(`  ${index + 1}. ${integration.name}`));
    console.log("Enter numbers separated by commas, or press Enter for no integrations.");
    output.write("Integrations: ");
    const integrationsLine = await lines.next();
    if (integrationsLine.done) throw new Error("No integration selection provided.");

    return {
      mode,
      selectedNames,
      selectedIntegrationNames: parseIntegrationSelection(integrationsLine.value),
    };
  } finally {
    prompt.close();
  }
}

async function promptForModeWithInput(): Promise<InitMode> {
  if (isInteractiveTerminal()) {
    const { mode } = await inquirer.prompt<{ mode: InitMode }>({
      type: "select",
      name: "mode",
      message: "How will you run the generator?",
      choices: [
        { name: "CLI", value: "cli" },
        { name: "Code", value: "code" },
      ],
    });
    return mode;
  }

  const prompt = readline.createInterface({ input, output });
  try {
    return await promptForMode(prompt);
  } finally {
    prompt.close();
  }
}

async function promptForInstall(): Promise<boolean> {
  if (isInteractiveTerminal()) {
    const { install } = await inquirer.prompt<{ install: boolean }>({
      type: "confirm",
      name: "install",
      message: "Install selected plugin packages now?",
      default: true,
    });
    return install;
  }

  const prompt = readline.createInterface({ input, output });
  try {
    const answer = await prompt.question("Install selected plugin packages now? (Y/n): ");
    return answer.trim() === "" || /^y(es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

function installPluginDependencies(packages: string[]): void {
  const packageManager = detectPackageManager();
  const args = packageManager === "npm"
    ? ["install", "-D", ...packages]
    : packageManager === "yarn"
      ? ["add", "-D", ...packages]
      : packageManager === "bun"
        ? ["add", "-d", ...packages]
        : ["add", "-D", ...packages];

  console.log(`Installing plugin packages with ${packageManager}...`);
  const result = spawnSync(packageManager, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Failed to install plugin packages with ${packageManager}.`);
  }
}

function printNextSteps(mode: InitMode, configPath: string, outputPath: string): void {
  console.log("\nNext steps:");
  const packageManager = detectPackageManager();
  if (mode === "cli") {
    const defaultConfigPath = path.resolve(process.cwd(), "cem-generator.config.mjs");
    const configArgument = configPath === defaultConfigPath ? "" : ` --config ${toCommandPath(configPath)}`;
    printPackageScript(`cem generate${configArgument}`, packageManager);
  } else {
    printPackageScript(`tsx ${toCommandPath(outputPath)}`, packageManager);
  }
}

function printPackageScript(command: string, packageManager: ReturnType<typeof detectPackageManager>): void {
  const runCommand = packageManager === "npm"
    ? "npm run cem"
    : packageManager === "yarn"
      ? "yarn cem"
      : packageManager === "bun"
        ? "bun run cem"
        : "pnpm run cem";
  console.log("  Add this script to package.json:");
  console.log(`    \"cem\": \"${command}\"`);
  console.log(`  Run it with: ${runCommand}`);
}

function toCommandPath(filePath: string): string {
  const relativePath = path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
  const normalizedPath = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  return /\s/.test(normalizedPath) ? JSON.stringify(normalizedPath) : normalizedPath;
}

function detectPackageManager(): "npm" | "pnpm" | "yarn" | "bun" {
  if (fs.existsSync(path.resolve("pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.resolve("yarn.lock"))) return "yarn";
  if (fs.existsSync(path.resolve("bun.lockb")) || fs.existsSync(path.resolve("bun.lock"))) return "bun";
  return "npm";
}

function validatePluginNames(names: string[]): string[] {
  const validNames = new Set(PLUGIN_CHOICES.map((plugin) => plugin.name));
  const invalidNames = names.filter((name) => !validNames.has(name as (typeof PLUGIN_CHOICES)[number]["name"]));
  if (invalidNames.length > 0) {
    throw new Error(`Unknown plugin(s): ${invalidNames.join(", ")}. Choose from: ${[...validNames].join(", ")}`);
  }
  return [...new Set(names)];
}

function validateIntegrationNames(names: string[]): string[] {
  const validNames = new Set(INTEGRATION_CHOICES.map((integration) => integration.name));
  const invalidNames = names.filter((name) => !validNames.has(name as (typeof INTEGRATION_CHOICES)[number]["name"]));
  if (invalidNames.length > 0) {
    throw new Error(`Unknown integration(s): ${invalidNames.join(", ")}. Choose from: ${[...validNames].join(", ")}`);
  }
  return [...new Set(names)];
}

async function promptForPluginsAndIntegrations(): Promise<{
  selectedNames: string[];
  selectedIntegrationNames: string[];
}> {
  if (isInteractiveTerminal()) {
    const { plugin, integrations } = await inquirer.prompt<{
      plugin: string;
      integrations: string[];
    }>([
      {
        type: "select",
        name: "plugin",
        message: "Which framework plugins should be included?",
        choices: PLUGIN_CHOICES.map((plugin) => ({ name: plugin.name, value: plugin.name })),
      },
      {
        type: "checkbox",
        name: "integrations",
        message: "Which project integrations should be included?",
        choices: INTEGRATION_CHOICES.map((integration) => ({
          name: integration.name,
          value: integration.name,
        })),
      },
    ]);
    return { selectedNames: [plugin], selectedIntegrationNames: integrations };
  }

  const prompt = readline.createInterface({ input, output });
  const lines = prompt[Symbol.asyncIterator]();
  try {
    console.log("Which framework plugins should be included?");
    PLUGIN_CHOICES.forEach((plugin, index) => console.log(`  ${index + 1}. ${plugin.name}`));
    console.log("Enter numbers separated by commas, or press Enter for vanilla only.");
    output.write("Plugins: ");
    const pluginsLine = await lines.next();
    if (pluginsLine.done) throw new Error("No plugin selection provided.");

    console.log("Which project integrations should be included? (multi-select)");
    INTEGRATION_CHOICES.forEach((integration, index) => console.log(`  ${index + 1}. ${integration.name}`));
    console.log("Enter numbers separated by commas, or press Enter for no integrations.");
    output.write("Integrations: ");
    const integrationsLine = await lines.next();
    if (integrationsLine.done) throw new Error("No integration selection provided.");

    return {
      selectedNames: parsePluginSelection(pluginsLine.value),
      selectedIntegrationNames: parseIntegrationSelection(integrationsLine.value),
    };
  } finally {
    prompt.close();
  }
}

async function promptForInteractiveSelections(): Promise<{
  mode: InitMode;
  selectedNames: string[];
  selectedIntegrationNames: string[];
}> {
  const { mode, plugin, integrations } = await inquirer.prompt<{
    mode: InitMode;
    plugin: string;
    integrations: string[];
  }>([
    {
      type: "select",
      name: "mode",
      message: "How will you run the generator?",
      choices: [
        { name: "CLI", value: "cli" },
        { name: "Code", value: "code" },
      ],
    },
    {
      type: "select",
      name: "plugin",
      message: "Which framework plugins should be included?",
      choices: PLUGIN_CHOICES.map((plugin) => ({ name: plugin.name, value: plugin.name })),
    },
    {
      type: "checkbox",
      name: "integrations",
      message: "Which project integrations should be included?",
      choices: INTEGRATION_CHOICES.map((integration) => ({
        name: integration.name,
        value: integration.name,
      })),
    },
  ]);

  return { mode, selectedNames: [plugin], selectedIntegrationNames: integrations };
}

function isInteractiveTerminal(): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

function parsePluginSelection(answer: string): string[] {
  return parseSelection(answer, PLUGIN_CHOICES, "plugin");
}

function parseIntegrationSelection(answer: string): string[] {
  return validateIntegrationNames(parseSelection(answer, INTEGRATION_CHOICES, "integration"));
}

function parseSelection(
  answer: string,
  choices: readonly { readonly name: string }[],
  label: string,
): string[] {
  const values = answer
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const names = values.map((value) => {
    const index = Number(value) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
      throw new Error(`Invalid ${label} selection: ${value}`);
    }
    return choices[index].name;
  });
  return names;
}

function createConfigSource(
  plugins: readonly (typeof PLUGIN_CHOICES)[number][],
  integrations: readonly (typeof INTEGRATION_CHOICES)[number][] = [],
  include?: string[],
  exclude: string[] = DEFAULT_SOURCE_EXCLUDE,
): string {
  const choices = [...plugins, ...integrations];
  const imports = choices.map((plugin) => `import { ${plugin.factory} } from "${plugin.packageName}";`);
  const factories = choices.map((plugin) =>
    `    ${plugin.factory}(${getPluginOptionsSource(plugin)}),`,
  );
  return [
    ...imports,
    imports.length ? "" : undefined,
    "export default {",
    ...(include ? [`  include: ${JSON.stringify(include)},`] : []),
    `  exclude: ${JSON.stringify(exclude)},`,
    ...(factories.length ? ["  plugins: [", ...factories, "  ],"] : []),
    "};",
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

function getPluginOptionsSource(
  plugin: (typeof PLUGIN_CHOICES)[number] | (typeof INTEGRATION_CHOICES)[number],
): string {
  if (!("options" in plugin) || !plugin.options) return "";

  return `{ ${Object.entries(plugin.options)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ")} }`;
}

function createCodeSource(
  configPath: string,
  outputPath: string
): string {
  let configImport = path.relative(path.dirname(outputPath), configPath).replaceAll(path.sep, "/");
  if (!configImport.startsWith(".")) configImport = `./${configImport}`;
  return [
    'import { generateCem } from "@wc-toolkit/cem-generator";',
    'import fs from "node:fs";',
    `import config from "${configImport}";`,
    "",
    "const manifest = generateCem(config);",
    'fs.writeFileSync("./custom-elements.json", JSON.stringify(manifest, null, 2) + "\\n");',
    "",
  ].join("\n");
}

program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
