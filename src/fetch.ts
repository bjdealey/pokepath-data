// Cache-first HTTP GET. Every page is fetched at most once and stored under
// cache/ (gitignored); parsing re-runs off disk with zero network. Live
// fetches are throttled to one at a time with a polite delay.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeMixed } from "./decode.ts";

const CACHE_DIR = fileURLToPath(new URL("../cache/", import.meta.url));
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DELAY_MS = 1500; // ponytail: fixed politeness delay, tune if it ever matters

let lastFetch = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Readable, reproducible cache path: cache/<host>/<path>.html */
function cachePath(url: string): string {
  const u = new URL(url);
  let p = u.pathname;
  if (p.endsWith("/")) p += "index";
  const rel = (u.host + p).replace(/[^a-zA-Z0-9._/-]/g, "_");
  return join(CACHE_DIR, rel.endsWith(".html") ? rel : rel + ".html");
}

export async function fetchCached(url: string, opts: { refresh?: boolean } = {}): Promise<string> {
  const path = cachePath(url);
  if (!opts.refresh && existsSync(path)) return readFile(path, "utf8");

  const wait = DELAY_MS - (Date.now() - lastFetch);
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();

  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const html = decodeMixed(await res.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html);
  return html;
}
