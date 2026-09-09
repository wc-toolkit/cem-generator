import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../dist/cli.js");

test("documents validation severity CLI options", () => {
  const result = spawnSync(process.execPath, [cliPath, "generate", "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--validate-exported-types <severity>/);
  assert.match(result.stdout, /--validation-invariants <severity>/);
});

test("documents init installation option", () => {
  const result = spawnSync(process.execPath, [cliPath, "init", "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--install/);
});

test("init creates a config with selected plugins", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-init-"));
  const result = spawnSync(process.execPath, [cliPath, "init", "--mode", "cli", "--plugin", "lit", "svelte"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const config = fs.readFileSync(path.join(projectDir, "cem-generator.config.mjs"), "utf8");
  assert.match(config, /import \{ litPlugin \} from "@wc-toolkit\/cem-generator-lit"/);
  assert.match(config, /import \{ sveltePlugin \} from "@wc-toolkit\/cem-generator-svelte"/);
  assert.match(config, /litPlugin\(\)/);
  assert.match(config, /sveltePlugin\(\)/);
});

test("init creates a code workflow with selected plugins", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-init-"));
  const result = spawnSync(process.execPath, [cliPath, "init", "--mode", "code", "--plugin", "lit"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const config = fs.readFileSync(path.join(projectDir, "cem-generator.config.mjs"), "utf8");
  assert.match(config, /litPlugin\(\)/);
  const source = fs.readFileSync(path.join(projectDir, "generate-cem.ts"), "utf8");
  assert.match(source, /import \{ generateCem \} from "@wc-toolkit\/cem-generator"/);
  assert.match(source, /import config from "\.\/cem-generator\.config\.mjs"/);
  assert.match(source, /generateCem\(config\)/);
});

test("init does not overwrite an existing config by default", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-init-"));
  const configPath = path.join(projectDir, "cem-generator.config.mjs");
  fs.writeFileSync(configPath, "export default {};\n");

  const result = spawnSync(process.execPath, [cliPath, "init", "--yes"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Output file already exists/);
  assert.equal(fs.readFileSync(configPath, "utf8"), "export default {};\n");
});
