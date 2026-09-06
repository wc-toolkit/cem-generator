import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { generateCem } from "@cem-generator/core";
import { litPlugin } from "@cem-generator/plugin-lit";
import { defineRegistrationPlugin } from "./plugins/define-registration-plugin.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsConfigPath = path.join(__dirname, "tsconfig.json");

// Vanilla HTMLElement detection is built into core and always runs.
// `plugins` here is for anything beyond that — Lit, in this example.
const manifest = generateCem({
  tsConfigPath,
  plugins: [litPlugin(), defineRegistrationPlugin()],
});

const outputPath = path.resolve(__dirname, "custom-elements.json");
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

console.log(`Wrote ${outputPath}`);
