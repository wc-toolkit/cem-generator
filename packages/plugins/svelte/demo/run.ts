import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCem } from "@wc-toolkit/cem-generator";
import { sveltePlugin } from "../src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsConfigPath = path.join(__dirname, "tsconfig.json");

const manifest = generateCem({
  tsConfigPath,
  plugins: [sveltePlugin()],
});
const outputPath = path.join(__dirname, "custom-elements.json");

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
console.log(`Wrote ${outputPath}`);
