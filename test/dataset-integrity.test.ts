// Referential-integrity guard for the committed dataset (not the parsers).
// Every cross-reference that a consumer relies on is asserted here, so a future
// scrape that reintroduces a dangling ref, a duplicate key, or an unresolvable
// name fails loudly in CI instead of silently corrupting the graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GEN = fileURLToPath(new URL("../dataset/gen3/", import.meta.url));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const readJson = (p: string) => JSON.parse(readFileSync(GEN + p, "utf8"));
const coll = (name: string) => {
  const m = new Map<string, any>();
  for (const f of readdirSync(GEN + name)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const r = JSON.parse(readFileSync(`${GEN}${name}/${f}`, "utf8"));
    m.set(r.slug, r);
  }
  return m;
};

const pokemon = coll("pokemon");
const moves = coll("moves");
const items = coll("items");
const machines: any[] = readJson("machines.json");
const typechart: Record<string, Record<string, number>> = readJson("typechart.json");
const enc: Record<string, any> = readJson("games/emerald/encounters.json");
const gameItems: Record<string, any> = readJson("games/emerald/items.json");
const trainers: any[] = readJson("games/emerald/trainers.json");
const story = readJson("games/emerald/story.json");
const connections: Record<string, any> = readJson("games/emerald/connections.json");
const gifts: any[] = readJson("games/emerald/gifts.json");
const legendaries: any[] = readJson("games/emerald/legendaries.json");
const trades: any[] = readJson("games/emerald/trades.json");

// A move name resolves if it matches a record slug or a record's normalized name.
const moveByNorm = new Set([...moves.values()].map((m) => norm(m.name)));
const machineCode = (c: string) => machines.find((m) => m.machine.toUpperCase() === String(c).toUpperCase());

test("pokemon: full dex 1–386, index matches, no unresolved evolution refs", () => {
  assert.equal(pokemon.size, 386);
  const nats = new Set([...pokemon.values()].map((p) => p.natdex));
  for (let i = 1; i <= 386; i++) assert.ok(nats.has(i), `missing natdex #${i}`);
  assert.equal(readJson("pokemon/index.json").length, pokemon.size);
  for (const p of pokemon.values()) {
    for (const e of p.evolutions ?? []) {
      assert.ok(pokemon.has(e.from), `${p.slug}: evolution.from '${e.from}' unresolved`);
      assert.ok(pokemon.has(e.to), `${p.slug}: evolution.to '${e.to}' unresolved`);
      assert.ok(e.method?.trim(), `${p.slug}→${e.to}: empty method`);
    }
    for (const s of p.evolutionChain ?? []) assert.ok(pokemon.has(s), `${p.slug}: chain '${s}' unresolved`);
    for (const mm of p.learnset?.machine ?? []) assert.ok(machineCode(mm.machine), `${p.slug}: machine '${mm.machine}' not in machines.json`);
    for (const t of Object.keys(p.damageTaken ?? {})) assert.ok(typechart[t] || t === "???", `${p.slug}: damageTaken type '${t}' invalid`);
  }
});

test("moves: learnedBy resolves with matching natdex; machine links valid", () => {
  for (const m of moves.values()) {
    for (const lb of m.learnedBy ?? []) {
      const p = pokemon.get(lb.pokemon);
      assert.ok(p, `move ${m.slug}: learnedBy '${lb.pokemon}' unknown`);
      assert.equal(p.natdex, lb.natdex, `move ${m.slug}: ${lb.pokemon} natdex mismatch`);
      if (lb.method === "machine" && lb.machine) assert.ok(machineCode(lb.machine), `move ${m.slug}: machine '${lb.machine}' unknown`);
    }
  }
});

test("machines: unique codes, moveSlug resolves, every HM has an obtain location", () => {
  const seen = new Set<string>();
  for (const mc of machines) {
    assert.ok(!seen.has(mc.machine), `duplicate machine ${mc.machine}`);
    seen.add(mc.machine);
    if (mc.moveSlug) assert.ok(moves.has(mc.moveSlug), `${mc.machine}: moveSlug '${mc.moveSlug}' not a move`);
    // HMs gate progression — each must have a known Emerald obtain location.
    if (mc.kind === "HM") assert.ok(mc.emerald?.locations?.length > 0, `${mc.machine} (${mc.move}) has no obtain location`);
  }
});

test("typechart: 17 attacking types, square and closed", () => {
  const types = Object.keys(typechart);
  assert.equal(types.length, 17);
  for (const atk of types) for (const def of Object.keys(typechart[atk]!)) assert.ok(types.includes(def), `row ${atk} references unknown type ${def}`);
});

test("emerald encounters: every mon resolves with matching natdex", () => {
  for (const [loc, v] of Object.entries(enc)) {
    for (const e of v.encounters ?? []) {
      const p = pokemon.get(e.pokemon);
      assert.ok(p, `${loc}: encounter '${e.pokemon}' unknown`);
      if (e.natdex) assert.equal(p.natdex, e.natdex, `${loc}: ${e.pokemon} natdex mismatch`);
    }
  }
});

test("emerald location items: every slug has an ItemDex definition", () => {
  const missing: string[] = [];
  for (const [loc, v] of Object.entries(gameItems)) for (const it of v.items ?? []) if (!items.has(it.slug)) missing.push(`${loc}:${it.slug}`);
  assert.deepEqual(missing, [], `location items with no itemdex def: ${missing.join(", ")}`);
});

test("emerald trainers: unique slugs, team + movesets resolve, story spine grounded", () => {
  const slugs = new Set<string>();
  for (const t of trainers) {
    assert.ok(!slugs.has(t.slug), `duplicate trainer slug '${t.slug}'`);
    slugs.add(t.slug);
    for (const p of t.team ?? []) {
      assert.ok(pokemon.has(p.pokemon), `trainer ${t.slug}: team '${p.pokemon}' unknown`);
      for (const mv of p.moves ?? []) assert.ok(moveByNorm.has(norm(mv)), `trainer ${t.slug}: move '${mv}' has no record`);
    }
  }
  for (const ms of story.milestones ?? []) assert.ok(slugs.has(ms.slug), `story milestone '${ms.name}' slug '${ms.slug}' matches no trainer`);
});

test("emerald critical path: ordered spine, beats tie to real locations", () => {
  const cp: any[] = story.criticalPath ?? [];
  assert.ok(cp.length >= 20, `critical path too short: ${cp.length}`);
  cp.forEach((b, i) => assert.equal(b.order, i + 1, `critical-path order gap at index ${i}`));
  const known = new Set<string>([...Object.keys(connections), ...Object.keys(enc), ...trainers.map((t) => t.location)]);
  for (const b of cp) {
    assert.ok(b.name && b.levelCap > 0, `beat ${b.order} missing name/levelCap`);
    if (b.location) assert.ok(known.has(b.location), `beat ${b.order} location '${b.location}' resolves to no game location`);
  }
});

test("emerald gifts: the starter trio is present and every gift resolves", () => {
  const starters = gifts.filter((g) => g.method === "starter").map((g) => g.pokemon).sort();
  assert.deepEqual(starters, ["mudkip", "torchic", "treecko"], "starter trio missing/incomplete");
  for (const g of gifts) {
    const p = pokemon.get(g.pokemon);
    assert.ok(p, `gift '${g.pokemon}' (${g.location}) unknown`);
    if (g.natdex) assert.equal(p.natdex, g.natdex, `gift ${g.pokemon} natdex mismatch`);
  }
});

test("emerald legendaries: resolve, valid method, key statics present", () => {
  for (const l of legendaries) {
    const p = pokemon.get(l.pokemon);
    assert.ok(p, `legendary '${l.pokemon}' unknown`);
    assert.equal(p.natdex, l.natdex, `legendary ${l.pokemon} natdex mismatch`);
    assert.ok(["static", "roaming", "event"].includes(l.method), `legendary ${l.pokemon}: bad method '${l.method}'`);
  }
  const slugs = new Set(legendaries.map((l) => l.pokemon));
  for (const must of ["kyogre", "groudon", "latias", "latios"]) assert.ok(slugs.has(must), `legendary '${must}' missing`);
});

test("emerald in-game trades: both sides resolve with matching natdex", () => {
  for (const t of trades) {
    for (const side of [t.give, t.receive]) {
      const p = pokemon.get(side.pokemon);
      assert.ok(p, `trade side '${side.pokemon}' unknown`);
      assert.equal(p.natdex, side.natdex, `trade ${side.pokemon} natdex mismatch`);
    }
  }
});

test("emerald connections: no dangling exits", () => {
  const dangling: string[] = [];
  for (const [slug, node] of Object.entries(connections)) for (const [dir, target] of Object.entries(node.exits ?? {})) if (!connections[target as string]) dangling.push(`${slug}.${dir}→${target}`);
  assert.deepEqual(dangling, [], `dangling exits: ${dangling.join(", ")}`);
});

test("emerald connections: every location is reachable from Littleroot (start→finish routable)", () => {
  const start = "littleroottown";
  assert.ok(connections[start], "start node littleroottown missing");
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const n = q.shift()!;
    for (const t of Object.values(connections[n]?.exits ?? {}) as string[]) if (!seen.has(t) && connections[t]) { seen.add(t); q.push(t); }
  }
  const unreachable = Object.keys(connections).filter((k) => !seen.has(k));
  assert.deepEqual(unreachable, [], `unreachable from Littleroot: ${unreachable.join(", ")}`);
});
