// Scan dataset/ for generation subtrees and emit dataset/manifest.json — the
// discovery document (which generations exist, their games, entity counts) that
// static consumers read without the API. No network; run after a generation's
// data is built.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATASET_ROOT } from "../paths.ts";

const countFiles = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").length : 0;
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export function deriveManifest() {
  const generations: Array<{ gen: number; games: string[]; counts: Record<string, number> }> = [];
  for (const d of readdirSync(DATASET_ROOT)) {
    const m = d.match(/^gen(\d+)$/);
    if (!m || !isDir(join(DATASET_ROOT, d))) continue;
    const genDir = join(DATASET_ROOT, d);
    const gamesDir = join(genDir, "games");
    const games = existsSync(gamesDir)
      ? readdirSync(gamesDir).filter((g) => !g.startsWith(".") && isDir(join(gamesDir, g))).sort()
      : [];
    const machinesPath = join(genDir, "machines.json");
    generations.push({
      gen: Number(m[1]),
      games,
      counts: {
        pokemon: countFiles(join(genDir, "pokemon")),
        moves: countFiles(join(genDir, "moves")),
        items: countFiles(join(genDir, "items")),
        machines: existsSync(machinesPath) ? (JSON.parse(readFileSync(machinesPath, "utf8")) as unknown[]).length : 0,
      },
    });
  }
  generations.sort((a, b) => a.gen - b.gen);
  writeFileSync(join(DATASET_ROOT, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), generations }, null, 2));
  return { generations: generations.length, games: generations.reduce((n, g) => n + g.games.length, 0) };
}
