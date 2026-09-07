import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, mergeConfig } from "../dist/config-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("config-loader", () => {
  const testDir = path.join(__dirname, "temp-config-test");
  const originalCwd = process.cwd();

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("loads .mjs config file", async () => {
    const configContent = `export default { include: ["src/**/*.ts"], conflictPolicy: "last-wins" };`;
    fs.writeFileSync(path.join(testDir, "cem-generator.config.mjs"), configContent);

    const result = await loadConfig({ cwd: testDir });
    assert.ok(result.configPath?.endsWith("cem-generator.config.mjs"));
    assert.deepStrictEqual(result.options.include, ["src/**/*.ts"]);
    assert.strictEqual(result.options.conflictPolicy, "last-wins");
  });

  it("loads .js config file", async () => {
    const configContent = `export default { include: ["src/**/*.ts"] };`;
    fs.writeFileSync(path.join(testDir, "cem-generator.config.js"), configContent);

    const result = await loadConfig({ cwd: testDir });
    assert.ok(result.configPath?.endsWith("cem-generator.config.js"));
    assert.deepStrictEqual(result.options.include, ["src/**/*.ts"]);
  });

  it("loads .cjs config file", async () => {
    const configContent = `module.exports = { include: ["src/**/*.ts"] };`;
    fs.writeFileSync(path.join(testDir, "cem-generator.config.cjs"), configContent);

    const result = await loadConfig({ cwd: testDir });
    assert.ok(result.configPath?.endsWith("cem-generator.config.cjs"));
    assert.deepStrictEqual(result.options.include, ["src/**/*.ts"]);
  });

  it("returns empty options when no config file exists", async () => {
    const result = await loadConfig({ cwd: testDir });
    assert.strictEqual(result.configPath, undefined);
    assert.deepStrictEqual(result.options, {});
  });

  it("loads explicit config path", async () => {
    const configDir = path.join(testDir, "custom-config");
    fs.mkdirSync(configDir, { recursive: true });
    const configContent = `export default { include: ["custom/**/*.ts"] };`;
    const configPath = path.join(configDir, "my-config.mjs");
    fs.writeFileSync(configPath, configContent);

    const result = await loadConfig({ cwd: testDir, configPath });
    assert.strictEqual(result.configPath, configPath);
    assert.deepStrictEqual(result.options.include, ["custom/**/*.ts"]);
  });

  it("throws when explicit config path not found", async () => {
    await assert.rejects(
      loadConfig({ cwd: testDir, configPath: "nonexistent.mjs" }),
      /Config file not found/
    );
  });

  it("merges CLI options with config file options", () => {
    const cliOptions = {
      tsConfigPath: "tsconfig.json",
      include: ["cli/**/*.ts"],
      conflictPolicy: "throw",
    };
    const fileOptions = {
      include: ["config/**/*.ts"],
      exclude: ["**/*.test.ts"],
      conflictPolicy: "last-wins",
    };

    const merged = mergeConfig(cliOptions, fileOptions);

    // CLI takes precedence for single-value options
    assert.strictEqual(merged.conflictPolicy, "throw");
    // Arrays are concatenated (config first, then CLI)
    assert.deepStrictEqual(merged.include, ["config/**/*.ts", "cli/**/*.ts"]);
    assert.deepStrictEqual(merged.exclude, ["**/*.test.ts"]);
    // tsConfigPath from CLI
    assert.strictEqual(merged.tsConfigPath, "tsconfig.json");
  });

  it("merges plugins arrays", () => {
    const cliOptions = { plugins: ["cli-plugin"] };
    const fileOptions = { plugins: ["file-plugin"] };

    const merged = mergeConfig(cliOptions, fileOptions);
    assert.deepStrictEqual(merged.plugins, ["file-plugin", "cli-plugin"]);
  });

  it("merges inheritance objects", () => {
    const cliOptions = { inheritance: { omitInherited: true } };
    const fileOptions = { inheritance: { externalManifests: ["ext.json"] } };

    const merged = mergeConfig(cliOptions, fileOptions);
    assert.deepStrictEqual(merged.inheritance, {
      omitInherited: true,
      externalManifests: ["ext.json"],
    });
  });
});
