import path from "node:path";
import {
  parseCssMetadata,
  type ClassFragment,
  type DetectorPlugin,
  type FileContext,
  type ManifestFragment,
} from "@wc-toolkit/cem-generator";

/** Detects Svelte components compiled as custom elements. */
export function sveltePlugin(): DetectorPlugin {
  return {
    name: "svelte",

    claims(sourceText, filePath) {
      return filePath.endsWith(".svelte") && /<svelte:options\b[^>]*customElement/.test(sourceText);
    },

    onFile(context: FileContext): ManifestFragment {
      const source = context.sourceText;
      const tagName = getTagName(source);
      if (!tagName) return {};

      const props = getProps(source);
      const metadata = getComponentMetadata(source, tagName);
      const fragment: ClassFragment = {
        name: getComponentName(context.filePath),
        module: context.filePath,
        description: metadata.description,
        summary: metadata.summary,
        deprecated: metadata.deprecated,
        tagName: metadata.tagName ?? tagName,
        members: props.length ? props.map(({ attribute: _attribute, ...member }) => member) : undefined,
        attributes: props.length ? props.map(({ name: fieldName, type, parsedType, description, attribute }) => ({
          name: attribute ?? fieldName,
          type,
          parsedType,
          description,
          fieldName,
        })) : undefined,
        events: mergeNamed(discoverEvents(source), metadata.events),
        slots: mergeNamed(discoverSlots(source), metadata.slots),
        cssParts: mergeNamed(discoverParts(source), metadata.cssParts),
        cssProperties: mergeNamed(discoverCssProperties(source), metadata.cssProperties),
        cssStates: metadata.cssStates,
      };
      return { [fragment.name]: fragment };
    },
  };
}

type SvelteMetadata = Pick<ClassFragment, "description" | "summary" | "deprecated" | "tagName" | "events" | "slots" | "cssParts" | "cssProperties" | "cssStates">;

function getTagName(source: string): string | undefined {
  const options = source.match(/<svelte:options\b[^>]*customElement\s*=\s*(?:["']([^"']+)["']|\{\{?\s*tag\s*:\s*["']([^"']+)["'])/s);
  return options?.[1] ?? options?.[2];
}

function getComponentName(filePath: string): string {
  return path.basename(filePath, ".svelte").replace(/[^A-Za-z0-9]+(.)/g, (_match, character: string) => character.toUpperCase());
}

function getProps(source: string): Array<NonNullable<ClassFragment["members"]>[number] & { attribute?: string }> {
  const props: Array<NonNullable<ClassFragment["members"]>[number] & { attribute?: string }> = [];
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
  const interfaces = new Map<string, { type?: string; description?: string }>();
  for (const match of script.matchAll(/(?:\/\*\*([\s\S]*?)\*\/\s*)?(\w+)\??\s*:\s*([^;\n,}]+)/g)) {
    interfaces.set(match[2], { type: match[3].trim(), description: cleanComment(match[1]) });
  }

  for (const match of script.matchAll(/(?:\/\*\*([\s\S]*?)\*\/\s*)?export\s+let\s+(\w+)\s*(?::\s*([^=;]+))?\s*(?:=\s*([^;\n]+))?/g)) {
    const [, comment, name, type, defaultValue] = match;
    props.push({ name, kind: "field", type: type?.trim() ?? inferType(defaultValue), description: cleanComment(comment), default: defaultValue?.trim(), attribute: name.toLowerCase() });
  }

  const runeProps = script.match(/\b(?:let|const)\s*\{([\s\S]*?)\}\s*(?::\s*(\w+))?\s*=\s*\$props\s*\(\s*\)/)?.[1];
  for (const entry of runeProps?.split(",") ?? []) {
    const match = entry.trim().match(/^(\w+)(?:\s*=\s*(.+))?$/);
    if (!match || props.some((prop) => prop.name === match[1])) continue;
    const info = interfaces.get(match[1]);
    props.push({ name: match[1], kind: "field", type: info?.type ?? inferType(match[2]), description: info?.description, default: match[2]?.trim(), attribute: match[1].toLowerCase() });
  }

  const options = source.match(/<svelte:options\b([\s\S]*?)\/>/)?.[1] ?? "";
  for (const match of options.matchAll(/(\w+)\s*:\s*\{[^}]*?attribute\s*:\s*["']([^"']+)["'][^}]*\}/g)) {
    const prop = props.find((item) => item.name === match[1]);
    if (prop) prop.attribute = match[2];
  }
  return props;
}

function getComponentMetadata(source: string, tagName: string): SvelteMetadata {
  const comment = source.match(/\/\*\*([\s\S]*?)\*\/\s*<svelte:options/)?.[1] ?? "";
  const description = cleanComment(comment.replace(/\n\s*\*\s*@\w+[\s\S]*/, ""));
  const summary = getTagDescription(comment, "summary");
  const deprecated = getTagDescription(comment, "deprecated");
  return {
    description,
    summary,
    deprecated: deprecated || undefined,
    tagName,
    events: parseNamedTags(comment, "event"),
    slots: parseNamedTags(comment, "slot"),
    cssParts: parseNamedTags(comment, "csspart"),
    cssProperties: parseCssTags(comment),
    cssStates: parseNamedTags(comment, "cssState"),
  };
}

function discoverSlots(source: string): ClassFragment["slots"] {
  return [...source.matchAll(/<slot(?:\s+name\s*=\s*["']([^"']+)["'])?[^>]*>/g)].map((match) => ({ name: match[1] ?? "", description: trailingHtmlComment(source.slice(0, match.index ?? 0)) }));
}

function discoverParts(source: string): ClassFragment["cssParts"] {
  return [...source.matchAll(/<[^>]*\bpart\s*=\s*["']([^"']+)["'][^>]*>/g)].flatMap((match) => match[1].split(/\s+/).filter(Boolean).map((name) => ({ name, description: trailingHtmlComment(source.slice(0, match.index ?? 0)) })));
}

function discoverCssProperties(source: string): ClassFragment["cssProperties"] {
  const properties: NonNullable<ClassFragment["cssProperties"]> = [];
  for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) properties.push(...(parseCssMetadata(match[1]) ?? []));
  return properties;
}

function discoverEvents(source: string): ClassFragment["events"] {
  const events: NonNullable<ClassFragment["events"]> = [];
  for (const match of source.matchAll(/(?:dispatch\s*\(\s*|dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*)["']([^"']+)["']/g)) events.push({ name: match[1], type: "CustomEvent" });
  return events;
}

function parseNamedTags(comment: string, tag: string): Array<{ name: string; description?: string }> | undefined {
  const values = [...comment.matchAll(new RegExp(`@${tag}\\s+([^\\s-]+|-)\\s*(?:-\\s*)?([^\\n]*)`, "g"))].map((match) => ({ name: match[1] === "-" ? "" : match[1], description: match[2]?.trim() || undefined }));
  return values.length ? values : undefined;
}

function parseCssTags(comment: string): ClassFragment["cssProperties"] {
  const values = [...comment.matchAll(/@cssprop(?:erty)?\s+(?:\[([^=\]]+)=([^\]]+)\]|(\S+))\s*(?:-\s*)?([^\n]*)/g)].map((match) => ({ name: match[1] ?? match[3], default: match[2], description: match[4]?.trim() || undefined }));
  return values.length ? values : undefined;
}

function getTagDescription(comment: string, tag: string): string | undefined {
  return comment.match(new RegExp(`@${tag}\\s+([^\\n]*)`))?.[1]?.trim() || undefined;
}

function cleanComment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.split("\n").map((line) => line.replace(/^\s*\*\s?/, "")).join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

function trailingHtmlComment(value: string): string | undefined {
  const end = value.lastIndexOf("-->");
  if (end < 0 || value.slice(end + 3).trim()) return undefined;
  const start = value.lastIndexOf("<!--", end);
  return start >= 0 ? cleanComment(value.slice(start + 4, end)) : undefined;
}

function inferType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^['"]/.test(value)) return "string";
  if (/^(true|false)$/.test(value)) return "boolean";
  if (/^\d/.test(value)) return "number";
  if (/^[\[{]/.test(value)) return value.startsWith("[") ? "array" : "object";
  return undefined;
}

function mergeNamed<T extends { name: string }>(...sources: Array<T[] | undefined>): T[] | undefined {
  const values = new Map<string, T>();
  for (const source of sources) for (const item of source ?? []) values.set(item.name, { ...values.get(item.name), ...item });
  return values.size ? [...values.values()] : undefined;
}
