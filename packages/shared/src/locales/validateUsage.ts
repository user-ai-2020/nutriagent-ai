import fs from "node:fs";
import path from "node:path";
import { enTranslations } from "./en";
import { heTranslations } from "./he";
import { ruTranslations } from "./ru";
import { leafKeys } from "./keyPaths";

export interface I18nUsageIssue {
  file: string;
  line: number;
  key: string;
  reason: "missing-from-en" | "missing-from-he" | "missing-from-ru";
}

export interface I18nUsageReport {
  ok: boolean;
  issues: I18nUsageIssue[];
  scannedFiles: number;
  referencedKeys: number;
}

const APP_SCAN_ROOTS = ["apps/mobile", "apps/user-portal/src", "apps/admin-portal/src"] as const;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Namespaces defined in locale files — used to detect dynamic key literals. */
const UI_NAMESPACES = Object.keys(enTranslations);

function buildNamespaceLiteralPattern(): RegExp {
  const ns = UI_NAMESPACES.join("|");
  return new RegExp(`["']((?:${ns})\\.[a-zA-Z][a-zA-Z0-9.]*)["']`, "g");
}

const STATIC_T_CALL = /\b(?:i18n\.)?t\s*\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;

const KEY_FIELD_LITERAL =
  /\b(?:titleKey|labelKey|shortKey|tabKey|key)\s*:\s*["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function collectReferencedKeys(content: string): Array<{ key: string; index: number }> {
  const found: Array<{ key: string; index: number }> = [];

  for (const regex of [STATIC_T_CALL, KEY_FIELD_LITERAL, buildNamespaceLiteralPattern()]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      found.push({ key: match[1], index: match.index });
    }
  }

  return found;
}

function walkSourceFiles(root: string, files: string[] = []): string[] {
  if (!fs.existsSync(root)) return files;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
      walkSourceFiles(full, files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    if (full.includes(`${path.sep}locales${path.sep}`) && /[\\/](en|he)\.ts$/.test(full)) continue;
    files.push(full);
  }

  return files;
}

export function validateI18nUsage(repoRoot: string): I18nUsageReport {
  const enKeys = new Set(leafKeys(enTranslations as Record<string, unknown>));
  const heKeys = new Set(leafKeys(heTranslations as Record<string, unknown>));
  const ruKeys = new Set(leafKeys(ruTranslations as Record<string, unknown>));
  const issues: I18nUsageIssue[] = [];
  const seen = new Set<string>();
  let scannedFiles = 0;

  for (const relRoot of APP_SCAN_ROOTS) {
    const absRoot = path.join(repoRoot, relRoot);
    for (const file of walkSourceFiles(absRoot)) {
      scannedFiles += 1;
      const content = fs.readFileSync(file, "utf8");
      const relFile = path.relative(repoRoot, file).replace(/\\/g, "/");

      for (const { key, index } of collectReferencedKeys(content)) {
        const dedupe = `${relFile}:${key}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);

        const line = lineNumberAt(content, index);
        if (!enKeys.has(key)) {
          issues.push({ file: relFile, line, key, reason: "missing-from-en" });
        } else if (!heKeys.has(key)) {
          issues.push({ file: relFile, line, key, reason: "missing-from-he" });
        } else if (!ruKeys.has(key)) {
          issues.push({ file: relFile, line, key, reason: "missing-from-ru" });
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    scannedFiles,
    referencedKeys: seen.size,
  };
}

export function formatI18nUsageReport(report: I18nUsageReport): string {
  if (report.ok) {
    return `i18n usage OK (${report.referencedKeys} keys in ${report.scannedFiles} files)`;
  }

  const lines = ["Missing UI translation keys (add to packages/shared/src/locales/en.ts, he.ts, and ru.ts):"];
  for (const issue of report.issues) {
    const locale =
      issue.reason === "missing-from-en" ? "en" : issue.reason === "missing-from-he" ? "he" : "ru";
    lines.push(`  ${issue.file}:${issue.line}  ${issue.key}  (missing from ${locale}.ts)`);
  }
  return lines.join("\n");
}

/** Check one dotted key against en.ts / he.ts / ru.ts — used by tests and tooling. */
export function translationKeyIssues(key: string): I18nUsageIssue[] {
  const enKeys = new Set(leafKeys(enTranslations as Record<string, unknown>));
  const heKeys = new Set(leafKeys(heTranslations as Record<string, unknown>));
  const ruKeys = new Set(leafKeys(ruTranslations as Record<string, unknown>));
  const issues: I18nUsageIssue[] = [];

  if (!enKeys.has(key)) {
    issues.push({ file: "<key>", line: 0, key, reason: "missing-from-en" });
  } else if (!heKeys.has(key)) {
    issues.push({ file: "<key>", line: 0, key, reason: "missing-from-he" });
  } else if (!ruKeys.has(key)) {
    issues.push({ file: "<key>", line: 0, key, reason: "missing-from-ru" });
  }

  return issues;
}
