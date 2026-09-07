import fs from "node:fs";
import path from "node:path";
import { GeneratorRunner, shouldTrigger, type CemGeneratorBuildOptions } from "./shared.js";

interface WebpackCompiler {
  options: { context?: string };
  hooks: {
    beforeRun: { tapPromise(name: string, fn: () => Promise<void>): void };
    watchRun: { tapPromise(name: string, fn: (compiler: WebpackCompiler) => Promise<void>): void };
    afterCompile: { tap(name: string, fn: (compilation: { fileDependencies: { add(path: string): void } }) => void): void };
    watchClose: { tap(name: string, fn: () => void): void };
    shutdown: { tapPromise(name: string, fn: () => Promise<void>): void };
  };
  modifiedFiles?: ReadonlySet<string>;
  removedFiles?: ReadonlySet<string>;
}

export class CemGeneratorWebpackPlugin {
  static #name = "CemGeneratorWebpackPlugin";
  #options: CemGeneratorBuildOptions;
  #runner?: GeneratorRunner;
  #hasRun = false;

  constructor(options: CemGeneratorBuildOptions = {}) {
    this.#options = options;
  }

  apply(compiler: WebpackCompiler): void {
    const root = compiler.options.context ?? process.cwd();
    this.#runner = new GeneratorRunner(root, this.#options);

    const watchPaths = this.#options.watchPaths ?? [];
    const normalizedWatchPaths = watchPaths.map((value) => path.resolve(root, value));
    const missing = normalizedWatchPaths.filter((value) => !fs.existsSync(value));
    if (missing.length) console.warn(`[cem-generator] watchPaths do not exist: ${missing.join(", ")}`);

    compiler.hooks.beforeRun.tapPromise(CemGeneratorWebpackPlugin.#name, async () => {
      this.#hasRun = true;
      await this.#runner!.run();
    });
    compiler.hooks.watchRun.tapPromise(CemGeneratorWebpackPlugin.#name, async (comp) => {
      if (!this.#hasRun) {
        this.#hasRun = true;
        await this.#runner!.run();
        return;
      }
      const changed = [...(comp.modifiedFiles ?? []), ...(comp.removedFiles ?? [])];
      if (changed.some((filePath) => shouldTrigger(filePath, this.#runner!.outputPath))) {
        this.#runner!.scheduleRun();
      }
    });
    compiler.hooks.afterCompile.tap(CemGeneratorWebpackPlugin.#name, (compilation) => {
      for (const watchPath of normalizedWatchPaths) compilation.fileDependencies.add(watchPath);
    });
    compiler.hooks.watchClose.tap(CemGeneratorWebpackPlugin.#name, () => this.#runner?.cancelScheduledRun());
    compiler.hooks.shutdown.tapPromise(CemGeneratorWebpackPlugin.#name, async () => this.#runner?.cancelScheduledRun());
  }
}

export default CemGeneratorWebpackPlugin;
