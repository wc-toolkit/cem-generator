import type { CemGeneratorBuildOptions } from "./shared.js";
import { GeneratorRunner, shouldTrigger } from "./shared.js";

interface ViteConfig {
  root: string;
  command: "build" | "serve";
  logger?: { error?(message: string): void; warn?(message: string): void };
}

interface ViteServer {
  config: { logger: { error?(message: string): void; warn?(message: string): void } };
  watcher: { on(event: "add" | "change" | "unlink", handler: (filePath: string) => void): void };
}

export interface CemGeneratorPluginOptions extends CemGeneratorBuildOptions {
  /** Run on Vite dev-server startup and changes. @default true */
  runInServe?: boolean;
}

export function cemGeneratorPlugin(options: CemGeneratorPluginOptions = {}) {
  const runInServe = options.runInServe ?? true;
  let root = process.cwd();
  let isServe = false;
  let runner: GeneratorRunner | undefined;

  const initialize = (logger?: ViteConfig["logger"]) => {
    if (runner) return;
    runner = new GeneratorRunner(root, options, {
      onError: (error) => (logger?.error ?? console.error)(error.message),
    });
  };

  return {
    name: "cem-generator",
    enforce: "pre" as const,
    configResolved(config: ViteConfig) {
      root = config.root;
      isServe = config.command === "serve";
      initialize(config.logger);
    },
    async buildStart() {
      initialize();
      if (!isServe) await runner!.run();
    },
    watchChange(id: string) {
      if (!isServe && shouldTrigger(id, runner?.outputPath)) runner?.scheduleRun();
    },
    closeWatcher() {
      runner?.cancelScheduledRun();
    },
    configureServer(server: ViteServer) {
      if (!runInServe) return;
      initialize(server.config.logger);
      void runner!
        .run()
        .catch((error) => (server.config.logger.error ?? console.error)(error.message));
      const onChange = (filePath: string) => {
        if (shouldTrigger(filePath, runner?.outputPath)) runner?.scheduleRun();
      };
      server.watcher.on("add", onChange);
      server.watcher.on("change", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

export default cemGeneratorPlugin;
