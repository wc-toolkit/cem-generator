import fs from "node:fs";
import path from "node:path";
import {
  generateCem,
  loadConfig,
  mergeConfig,
  type RunOptions,
} from "@cem-generator/core";

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"]);

export interface CemGeneratorBuildOptions extends RunOptions {
  /** Generator config path, relative to the bundler project root. */
  config?: string;
  /** Manifest output path, relative to the bundler project root. */
  output?: string;
  /** Debounce delay for watch reruns. @default 120 */
  debounceMs?: number;
  /** Additional paths to register with Webpack's watcher. */
  watchPaths?: string[];
}

export interface GeneratorRunnerHooks {
  onError?: (error: Error) => void;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function shouldTrigger(filePath: string, outputPath?: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (outputPath && path.resolve(filePath) === path.resolve(outputPath)) return false;
  if (normalized.endsWith("custom-elements.json")) return false;
  if (normalized.includes("cem-generator.config.")) return true;
  return SOURCE_EXTENSIONS.has(path.extname(normalized));
}

export function resolveOutputPath(root: string, output?: string): string {
  return path.resolve(root, output ?? "custom-elements.json");
}

export class GeneratorRunner {
  #root: string;
  #options: CemGeneratorBuildOptions;
  #outputPath: string;
  #debounceMs: number;
  #onError: (error: Error) => void;
  #runInFlight = false;
  #queuedRun = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #resolvedOptions: RunOptions | undefined;

  constructor(root: string, options: CemGeneratorBuildOptions, hooks: GeneratorRunnerHooks = {}) {
    this.#root = root;
    this.#options = options;
    this.#outputPath = resolveOutputPath(root, options.output);
    this.#debounceMs = options.debounceMs ?? 120;
    this.#onError = hooks.onError ?? ((error) => console.error(error.message));
  }

  get outputPath(): string {
    return this.#outputPath;
  }

  async run(): Promise<void> {
    if (this.#runInFlight) {
      this.#queuedRun = true;
      return;
    }

    this.#runInFlight = true;
    try {
      do {
        this.#queuedRun = false;
        if (!this.#resolvedOptions) {
          const config = await loadConfig({ cwd: this.#root, configPath: this.#options.config });
          const directOptions: RunOptions = { ...this.#options };
          delete (directOptions as CemGeneratorBuildOptions).config;
          delete (directOptions as CemGeneratorBuildOptions).output;
          delete (directOptions as CemGeneratorBuildOptions).debounceMs;
          if (directOptions.tsConfigPath) {
            directOptions.tsConfigPath = path.resolve(this.#root, directOptions.tsConfigPath);
          } else {
            directOptions.tsConfigPath = path.join(this.#root, "tsconfig.json");
          }
          this.#resolvedOptions = mergeConfig(directOptions, config.options);
        }

        const manifest = generateCem(this.#resolvedOptions);
        fs.mkdirSync(path.dirname(this.#outputPath), { recursive: true });
        fs.writeFileSync(this.#outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      } while (this.#queuedRun);
    } catch (error) {
      throw asError(error);
    } finally {
      this.#runInFlight = false;
    }
  }

  scheduleRun(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.run().catch((error) => this.#onError(asError(error)));
    }, this.#debounceMs);
  }

  cancelScheduledRun(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }
}
