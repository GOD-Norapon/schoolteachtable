#!/usr/bin/env node
/**
 * Standalone script to poke Supabase REST API so the Free-tier project
 * does not pause after 7 days of inactivity while developing locally.
 *
 * Usage:
 *   node scripts/poke-supabase.mjs
 *   npm run poke:supabase
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, ".env"));

const rawUrl = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).trim();

const key = (
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""
).trim();

const cleanUrl = rawUrl.replace(/\/+$/, "");

if (
  !cleanUrl ||
  !cleanUrl.startsWith("http") ||
  cleanUrl.includes("your-project")
) {
  console.error(
    `[${new Date().toISOString()}] ERROR: Supabase URL is not configured in .env.local (current value: "${cleanUrl || "(empty)"}").`
  );
  console.error(
    "Please set NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co in .env.local"
  );
  process.exit(1);
}

if (!key) {
  console.error(
    `[${new Date().toISOString()}] ERROR: Supabase key is missing. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local`
  );
  process.exit(1);
}

const endpoint = `${cleanUrl}/rest/v1/academic_terms?select=id&limit=1`;
const startedAt = Date.now();

try {
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  const latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error(
      `[${new Date().toISOString()}] Poke failed: HTTP ${res.status} (${latencyMs}ms) ${bodyText}`
    );
    process.exit(1);
  }

  console.log(
    `[${new Date().toISOString()}] Supabase poked successfully (HTTP ${res.status}, ${latencyMs}ms)`
  );
} catch (err) {
  const latencyMs = Date.now() - startedAt;
  console.error(
    `[${new Date().toISOString()}] Poke error (${latencyMs}ms):`,
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
}
