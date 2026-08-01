#!/usr/bin/env node
/**
 * Task 7.4.2 — SSR RTL regression check for both Next.js portals.
 * Requires production servers already running (fresh build recommended).
 *
 * Usage:
 *   USER_PORTAL_URL=http://localhost:3008 ADMIN_PORTAL_URL=http://localhost:3007 node scripts/verify-portal-ssr-rtl.mjs
 */

const USER_PORTAL_URL = process.env.USER_PORTAL_URL ?? "http://localhost:3008";
const ADMIN_PORTAL_URL = process.env.ADMIN_PORTAL_URL ?? "http://localhost:3007";

async function assertSsrDirection(name, baseUrl, cookie, expectedLang, expectedDir) {
  const res = await fetch(`${baseUrl}/`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });

  if (!res.ok && res.status !== 307 && res.status !== 308) {
    throw new Error(`${name}: HTTP ${res.status} from ${baseUrl}/`);
  }

  const html = (await res.text()).slice(0, 600);
  const langOk = html.includes(`lang="${expectedLang}"`);
  const dirOk = html.includes(`dir="${expectedDir}"`);

  if (!langOk || !dirOk) {
    throw new Error(
      `${name} FAILED (${cookie})\nExpected: lang="${expectedLang}" dir="${expectedDir}"\nGot snippet:\n${html}`
    );
  }

  console.log(`${name} PASS  cookie=${cookie}  →  lang="${expectedLang}" dir="${expectedDir}"`);
  console.log(`  snippet: ${html.replace(/\s+/g, " ").slice(0, 120)}…`);
}

async function main() {
  const checks = [
    ["user-portal", USER_PORTAL_URL, "preferredLanguage=he", "he", "rtl"],
    ["user-portal", USER_PORTAL_URL, "preferredLanguage=en", "en", "ltr"],
    ["admin-portal", ADMIN_PORTAL_URL, "preferredLanguage=he", "he", "rtl"],
    ["admin-portal", ADMIN_PORTAL_URL, "preferredLanguage=en", "en", "ltr"],
  ];

  for (const [name, url, cookie, lang, dir] of checks) {
    await assertSsrDirection(name, url, cookie, lang, dir);
  }

  console.log("\nAll SSR RTL regression checks passed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
