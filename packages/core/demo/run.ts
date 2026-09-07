import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCem } from "@wc-toolkit/cem-generator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsConfigPath = path.join(__dirname, "tsconfig.json");

const manifest = generateCem({ tsConfigPath });
const outputPath = path.join(__dirname, "custom-elements.json");

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
console.log(`Wrote ${outputPath}`);
