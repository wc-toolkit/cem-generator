import path from "node:path";
import fs from "node:fs";
import type { RunOptions } from "./pipeline.js";

export type GeneratorConfig = RunOptions & { filePath?: string };

const CONFIG_FILENAMES = [
  "cem-generator.config.mjs",
  "cem-generator.config.js",
  "cem-generator.config.cjs",
  "cem-generator.config.ts",
];

function findConfigFile(searchDir: string): string | undefined {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(searchDir, filename);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return undefined;
}

async function loadConfigFile(configPath: string): Promise<GeneratorConfig> {
  const resolvedPath = path.resolve(configPath);
  const isTypeScript = configPath.endsWith(".ts");

  let configModule: unknown;

  if (isTypeScript) {
    try {
      const { tsImport } = await import("tsx/esm/api");
      configModule = await tsImport(resolvedPath, import.meta.url);
    } catch {
      throw new Error(
        `Failed to load TypeScript config "${configPath}". ` +
          `Install "tsx" to use .ts config files: npm install --save-dev tsx`,
      );
    }
  } else {
    const moduleUrl = pathToFileURL(resolvedPath).href;
    configModule = await import(moduleUrl);
  }

  const config = (configModule as { default?: GeneratorConfig }).default ?? configModule;

  if (!config || typeof config !== "object") {
    throw new Error(`Config file "${configPath}" must export a default object`);
  }

  return config as GeneratorConfig;
}

function pathToFileURL(filePath: string): URL {
  return new URL(`file://${filePath}`);
}

export interface LoadConfigOptions {
  /** Directory to search for config file. Defaults to process.cwd() */
  cwd?: string;
  /** Explicit config file path to load */
  configPath?: string;
}

export interface LoadConfigResult {
  /** The loaded config options */
  options: GeneratorConfig;
  /** Path to the config file that was loaded, if any */
  configPath: string | undefined;
}

/**
 * Loads configuration from a cem-generator.config.{js,mjs,cjs,ts} file.
 * Searches in the given directory (or cwd) for the first matching config file.
 * Returns the loaded options and the path to the config file.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  let configPath = options.configPath;

  if (!configPath) {
    configPath = findConfigFile(cwd);
  } else {
    configPath = path.resolve(cwd, configPath);
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
  }

  if (!configPath) {
    return { options: {}, configPath: undefined };
  }

  const loadedOptions = await loadConfigFile(configPath);
  return { options: loadedOptions, configPath };
}

/**
 * Merges CLI options with config file options.
 * CLI options take precedence over config file options.
 */
export function mergeConfig(cliOptions: RunOptions, fileOptions: GeneratorConfig): GeneratorConfig {
  const merged: RunOptions = { ...fileOptions, ...cliOptions };

  if (cliOptions.plugins && fileOptions.plugins) {
    merged.plugins = [...fileOptions.plugins, ...cliOptions.plugins];
  } else if (cliOptions.plugins) {
    merged.plugins = cliOptions.plugins;
  } else if (fileOptions.plugins) {
    merged.plugins = fileOptions.plugins;
  }

  if (cliOptions.include && fileOptions.include) {
    merged.include = [...fileOptions.include, ...cliOptions.include];
  } else if (cliOptions.include) {
    merged.include = cliOptions.include;
  } else if (fileOptions.include) {
    merged.include = fileOptions.include;
  }

  if (cliOptions.exclude && fileOptions.exclude) {
    merged.exclude = [...fileOptions.exclude, ...cliOptions.exclude];
  } else if (cliOptions.exclude) {
    merged.exclude = cliOptions.exclude;
  } else if (fileOptions.exclude) {
    merged.exclude = fileOptions.exclude;
  }

  if (cliOptions.inheritance !== undefined && fileOptions.inheritance !== undefined) {
    merged.inheritance = {
      ...(fileOptions.inheritance as object),
      ...(cliOptions.inheritance as object),
    };
  } else if (cliOptions.inheritance !== undefined) {
    merged.inheritance = cliOptions.inheritance;
  } else if (fileOptions.inheritance !== undefined) {
    merged.inheritance = fileOptions.inheritance;
  }

  if (cliOptions.validation && fileOptions.validation) {
    merged.validation = { ...fileOptions.validation, ...cliOptions.validation };
  } else if (cliOptions.validation) {
    merged.validation = cliOptions.validation;
  } else if (fileOptions.validation) {
    merged.validation = fileOptions.validation;
  }

  return merged;
}
