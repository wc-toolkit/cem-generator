import fs from "node:fs";
import path from "node:path";
import type { Package as CemPackage } from "custom-elements-manifest/schema";
import { generateCemWithProgram } from "./pipeline.js";
import type { RunOptions } from "./pipeline.js";

const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".cts",
  ".mts",
  ".ts",
  ".tsx",
]);

export interface GeneratorWatchOptions {
  /** Directory to watch. Defaults to the tsconfig directory. */
  root?: string;
  /** Debounce delay for source changes. @default 120 */
  debounceMs?: number;
  /** Called after the initial generation and each subsequent change. */
  onManifest: (manifest: CemPackage) => void;
  /** Called when a watch generation fails. */
  onError?: (error: Error) => void;
}

export interface GeneratorWatchHandle {
  /** Resolves after the initial manifest has been generated. */
  ready: Promise<CemPackage>;
  /** Stops watching for changes. */
  close(): void;
}

export interface GeneratorSession {
  /** Generates a manifest and retains its TypeScript program for reuse. */
  generate(): CemPackage;
  /** Generates once, then watches source files for subsequent changes. */
  watch(options: GeneratorWatchOptions): GeneratorWatchHandle;
  /** Stops any active watch. */
  close(): void;
}

export function createGeneratorSession(options: RunOptions = {}): GeneratorSession {
  let previousProgram: Parameters<typeof generateCemWithProgram>[1];
  let watcher: fs.FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let lastGeneratedAt = Date.now();

  const generate = (): CemPackage => {
    const result = generateCemWithProgram(options, previousProgram);
    previousProgram = result.programResult.program;
    return result.manifest;
  };

  const close = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    watcher?.close();
    watcher = undefined;
  };

  const watch = (watchOptions: GeneratorWatchOptions): GeneratorWatchHandle => {
    close();
    const root = path.resolve(
      watchOptions.root ?? path.dirname(path.resolve(options.tsConfigPath ?? "./tsconfig.json")),
    );
    const debounceMs = watchOptions.debounceMs ?? 120;
    const onError = watchOptions.onError ?? ((error) => console.error(error.message));

    const run = () => {
      if (running) return;
      running = true;
      try {
        const manifest = generate();
        watchOptions.onManifest(manifest);
        lastGeneratedAt = Date.now();
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        running = false;
      }
    };

    const ready = new Promise<CemPackage>((resolve, reject) => {
      try {
        const manifest = generate();
        watchOptions.onManifest(manifest);
        lastGeneratedAt = Date.now();
        resolve(manifest);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        onError(normalized);
        reject(normalized);
        return;
      }

      watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const relativePath = filename.toString().replaceAll(path.sep, "/");
        const segments = relativePath.split("/");
        if (
          segments.includes("node_modules") ||
          segments.includes("dist") ||
          segments.includes(".git") ||
          segments.includes(".astro") ||
          !SOURCE_EXTENSIONS.has(path.extname(relativePath))
        ) {
          return;
        }

        try {
          if (fs.statSync(path.resolve(root, relativePath)).mtimeMs <= lastGeneratedAt) return;
        } catch {
          // A removed source file still needs to trigger regeneration.
        }

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          run();
        }, debounceMs);
      });
      watcher.on("error", onError);
    });

    return { ready, close };
  };

  return { generate, watch, close };
}
