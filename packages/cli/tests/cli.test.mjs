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

test("generate uses source defaults and excludes common non-component files", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-generate-"));
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022" }, include: ["src/**/*.ts"] }),
  );
  fs.writeFileSync(
    path.join(projectDir, "src/component.ts"),
    "export class ComponentElement extends HTMLElement {}\ncustomElements.define(\"x-component\", ComponentElement);\n",
  );
  fs.writeFileSync(
    path.join(projectDir, "src/component.test.ts"),
    "export class TestElement extends HTMLElement {}\ncustomElements.define(\"x-test\", TestElement);\n",
  );

  const result = spawnSync(process.execPath, [cliPath, "generate", "--output", "manifest.json"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "manifest.json"), "utf8"));
  const names = manifest.modules.flatMap((module) => module.declarations.map((declaration) => declaration.name));
  assert.deepEqual(names, ["ComponentElement"]);
});

test("generate uses the file path from config when the CLI flag is omitted", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-generate-config-"));
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022" }, include: ["src/**/*.ts"] }),
  );
  fs.writeFileSync(
    path.join(projectDir, "src/component.ts"),
    "export class ComponentElement extends HTMLElement {}\ncustomElements.define(\"x-component\", ComponentElement);\n",
  );
  fs.writeFileSync(path.join(projectDir, "cem-generator.config.mjs"), 'export default { filePath: "dist/manifest.json" };\n');

  const result = spawnSync(process.execPath, [cliPath, "generate"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(projectDir, "dist/manifest.json")), true);
  assert.equal(fs.existsSync(path.join(projectDir, "custom-elements.json")), false);
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
  assert.match(result.stdout, /"cem": "cem generate"/);
  assert.match(result.stdout, /Run it with: npm run cem/);
});

test("init optionally adds the manifest path to package.json", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-init-package-"));
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  const result = spawnSync(process.execPath, [cliPath, "init", "--mode", "cli", "--plugin", "lit"], {
    cwd: projectDir,
    input: "y\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  assert.equal(packageJson.customElements, "custom-elements.json");
  assert.equal(packageJson.private, true);
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
  assert.match(result.stdout, /"cem": "tsx \.\/generate-cem\.ts"/);
  assert.match(result.stdout, /Run it with: npm run cem/);
});

test("interactive init creates selected integrations with default options", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-init-"));
  fs.mkdirSync(path.join(projectDir, "src"));
  const result = spawnSync(process.execPath, [cliPath, "init", "--mode", "cli"], {
    cwd: projectDir,
    input: "\n2,3,4\nn\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const config = fs.readFileSync(path.join(projectDir, "cem-generator.config.mjs"), "utf8");
  assert.match(config, /import \{ jsxTypesGeneratorPlugin \} from "@wc-toolkit\/jsx-types"/);
  assert.match(config, /jsxTypesGeneratorPlugin\(\{ outdir: "\.\/types", stronglyTypedEvents: true \}\)/);
  assert.match(config, /vuejsTypesGeneratorPlugin\(\{ outdir: "\.\/types", stronglyTypedEvents: true \}\)/);
  assert.match(config, /svelteTypesGeneratorPlugin\(\{ outdir: "\.\/types", stronglyTypedEvents: true \}\)/);
  assert.doesNotMatch(config, /reactWrapperGeneratorPlugin/);
  assert.match(config, /include: \["src\/\*\*\/\*\.\{ts,tsx,js,jsx\}"\]/);
  assert.match(config, /exclude: \[/);
  assert.match(config, /\*\*\/\*\.test\.\*/);
  assert.match(config, /\*\*\/\*\.spec\.\*/);
  assert.match(config, /\*\*\/\*\.stories\.\*/);
});

test("interactive init configures React wrappers with typed events", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cem-init-"));
  const result = spawnSync(process.execPath, [cliPath, "init", "--mode", "cli"], {
    cwd: projectDir,
    input: "\n1\nn\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const config = fs.readFileSync(path.join(projectDir, "cem-generator.config.mjs"), "utf8");
  assert.match(config, /reactWrapperGeneratorPlugin\(\{ stronglyTypedEvents: true \}\)/);
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
