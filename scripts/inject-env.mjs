#!/usr/bin/env node
/*
 * Injects the GA4 Measurement ID into a copy of data.js at deploy time, so the
 * committed source never holds it. Reads GA4_ID from the environment (set as a
 * GitHub Actions variable in CI) or from a local, gitignored .env file.
 *
 *   node scripts/inject-env.mjs [targetFile=data.js]
 *
 * No-op (exit 0) when GA4_ID is unset, leaving analytics disabled.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";

function fromDotenv(key) {
  if (!existsSync(".env")) return "";
  const line = readFileSync(".env", "utf8").split(/\r?\n/).find((l) => l.trim().startsWith(key + "="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const id = (process.env.GA4_ID || fromDotenv("GA4_ID") || "").trim();
const target = process.argv[2] || "data.js";

if (!id) {
  console.log("inject-env: GA4_ID not set — analytics stays disabled.");
  process.exit(0);
}
if (!/^G-[A-Z0-9]+$/i.test(id)) {
  console.error(`inject-env: "${id}" is not a valid GA4 Measurement ID (G-XXXXXXXXXX).`);
  process.exit(1);
}

const src = await readFile(target, "utf8");
const out = src.replace(/ga4Id:\s*""/, `ga4Id: "${id}"`);
if (out === src) {
  console.error(`inject-env: placeholder \`ga4Id: ""\` not found in ${target}.`);
  process.exit(1);
}
await writeFile(target, out);
console.log(`inject-env: injected ${id} into ${target}.`);
