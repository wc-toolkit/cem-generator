#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { generateCem, type RunOptions, loadConfig, mergeConfig } from "@cem-generator/core";
import type { Package as CemPackage } from "custom-elements-manifest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      const { options: fileOptions, configPath } = await loadConfig({
        cwd,
        configPath: options.config,
      });

      const cliOptions: RunOptions = {
        tsConfigPath: path.resolve(options.tsconfig),
        include: options.include,
        exclude: options.exclude,
        sort: options.sort !== false,
      };

      if (options.deprecatedLast) {
        cliOptions.deprecatedLast = true;
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

program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
