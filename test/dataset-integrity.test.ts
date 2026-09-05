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
const abilities = coll("abilities");
const abilitySlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
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
const natures: any[] = readJson("natures.json");
const obtainability: any[] = readJson("games/emerald/obtainability.json");
const STAT_KEYS = new Set(["hp", "attack", "defense", "spAttack", "spDefense", "speed"]);

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

test("content quality: eggGroups + level-up populated; no non-Gen-3 leak moves", () => {
  for (const p of pokemon.values()) {
    assert.ok(p.eggGroups?.length, `${p.slug}: empty eggGroups (should be a group or "Cannot Breed")`);
    assert.ok(p.learnset?.levelUp?.length, `${p.slug}: no level-up moves`);
  }
  for (const m of moves.values()) {
    // Real Gen-3 moves have PP; only Shadow (side-game, tagged) legitimately have none.
    assert.ok((m.pp as number) > 0 || m.gameExclusive, `move ${m.slug}: 0 PP but not gameExclusive — non-Gen-3 leak?`);
  }
  for (const i of items.values()) {
    assert.ok(i.effect, `item ${i.slug}: empty effect`);
    // Effect prose must not swallow a nested data table (e.g. a fossil's revived-Pokémon rows).
    assert.ok(!/Trainer Memo|Met at Level|\bOT:/i.test(i.effect as string), `item ${i.slug}: effect contains data-table leakage`);
  }
});

test("abilities: collection populated; every pokemon ability resolves to it", () => {
  assert.ok(abilities.size >= 70, `abilities collection too small: ${abilities.size}`);
  for (const a of abilities.values()) assert.ok(a.effect, `ability ${a.slug}: empty effect`);
  for (const p of pokemon.values()) {
    assert.ok(Array.isArray(p.abilities) && p.abilities.length, `${p.slug}: no abilities`);
    for (const name of p.abilities as string[]) assert.ok(abilities.has(abilitySlug(name)), `${p.slug}: ability '${name}' not in the abilities collection`);
  }
});

test("pokemon: evYield present with valid stats (Gen-3 total 1-3)", () => {
  for (const p of pokemon.values()) {
    const ev = Object.entries(p.evYield ?? {});
    assert.ok(ev.length > 0, `${p.slug}: empty evYield`);
    let sum = 0;
    for (const [k, v] of ev) {
      assert.ok(STAT_KEYS.has(k), `${p.slug}: evYield bad stat '${k}'`);
      assert.ok((v as number) >= 1 && (v as number) <= 3, `${p.slug}: evYield ${k}=${v} out of range`);
      sum += v as number;
    }
    assert.ok(sum >= 1 && sum <= 3, `${p.slug}: evYield total ${sum} — Gen-3 must be 1-3`);
  }
});

test("natures: 25 valid, 5 neutral, stat keys resolve (never HP)", () => {
  assert.equal(natures.length, 25);
  const slugs = new Set<string>();
  let neutral = 0;
  for (const n of natures) {
    assert.ok(!slugs.has(n.slug), `duplicate nature '${n.slug}'`);
    slugs.add(n.slug);
    if (!n.increased && !n.decreased) {
      neutral++;
      continue;
    }
    assert.ok(STAT_KEYS.has(n.increased) && STAT_KEYS.has(n.decreased), `${n.slug}: bad stat keys`);
    assert.notEqual(n.increased, n.decreased, `${n.slug}: increased == decreased (should be neutral)`);
    assert.notEqual(n.increased, "hp", `${n.slug}: HP is never nature-affected`);
    assert.notEqual(n.decreased, "hp", `${n.slug}: HP is never nature-affected`);
  }
  assert.equal(neutral, 5, "exactly 5 neutral natures");
});

test("obtainability: covers dex, refs resolve, transitive `obtainable` is consistent", () => {
  assert.equal(obtainability.length, pokemon.size);
  const registry = new Set(((readJson("games/emerald/locations.json") as any[]) ?? []).map((l) => l.slug));
  const bySlug = new Map(obtainability.map((o) => [o.pokemon, o]));
  for (const o of obtainability) {
    const p = pokemon.get(o.pokemon);
    assert.ok(p, `obtainability '${o.pokemon}' unknown`);
    assert.equal(p.natdex, o.natdex, `${o.pokemon}: natdex mismatch`);
    if (o.evolvesFrom) assert.ok(pokemon.has(o.evolvesFrom.from), `${o.pokemon}: evolvesFrom '${o.evolvesFrom.from}' unknown`);
    for (const w of o.wild) assert.ok(registry.has(w.location), `${o.pokemon}: wild location '${w.location}' not in registry`);
    const preEvoObtainable = !!(o.evolvesFrom && bySlug.get(o.evolvesFrom.from)?.obtainable);
    const directSrc = o.wild.length > 0 || o.gift || o.trade || o.event;
    // obtainable ⟺ a direct source OR an obtainable pre-evolution.
    assert.equal(o.obtainable, directSrc || preEvoObtainable, `${o.pokemon}: obtainable=${o.obtainable} inconsistent with sources`);
  }
});

test("abilities: pokemon reverse-index resolves and round-trips", () => {
  for (const a of abilities.values()) {
    assert.ok(Array.isArray(a.pokemon) && a.pokemon.length, `ability ${a.slug}: empty pokemon reverse-index`);
    for (const ref of a.pokemon) {
      const p = pokemon.get(ref.slug);
      assert.ok(p, `ability ${a.slug}: pokemon '${ref.slug}' unknown`);
      assert.equal(p.natdex, ref.natdex, `ability ${a.slug}: ${ref.slug} natdex mismatch`);
      // Round-trip: the Pokémon must actually list an ability that keys to this slug.
      assert.ok((p.abilities as string[]).some((n) => abilitySlug(n) === a.slug), `ability ${a.slug}: ${ref.slug} doesn't list it`);
    }
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

test("items: wildItems + heldBy/foundAt reverse-indexes resolve and round-trip", () => {
  const itemByNorm = new Map([...items.values()].map((i) => [norm(i.name), i.slug]));
  // Forward: every wild held item name a Pokémon carries has an ItemDex record.
  for (const p of pokemon.values()) {
    assert.ok(Array.isArray(p.wildItems), `${p.slug}: missing wildItems`);
    for (const w of p.wildItems as any[]) assert.ok(itemByNorm.has(norm(w.item)), `${p.slug}: wild item '${w.item}' has no ItemDex record`);
  }
  for (const it of items.values()) {
    for (const h of it.heldBy ?? []) {
      const p = pokemon.get(h.pokemon);
      assert.ok(p, `item ${it.slug}: heldBy '${h.pokemon}' unknown`);
      assert.equal(p.natdex, h.natdex, `item ${it.slug}: ${h.pokemon} natdex mismatch`);
      // Round-trip: the Pokémon's wildItems must name an item that keys to this slug.
      assert.ok((p.wildItems as any[]).some((w) => itemByNorm.get(norm(w.item)) === it.slug), `item ${it.slug}: ${h.pokemon} doesn't hold it`);
    }
    for (const fa of it.foundAt ?? []) {
      assert.ok(gameItems[fa.location], `item ${it.slug}: foundAt '${fa.location}' is not a game location`);
      assert.ok((gameItems[fa.location].items ?? []).some((li: any) => li.slug === it.slug), `item ${it.slug}: not actually at ${fa.location}`);
    }
  }
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

test("emerald critical path: ordered, every beat carries its kind's payload", () => {
  const cp: any[] = story.criticalPath ?? [];
  assert.ok(cp.length >= 40, `critical path too short: ${cp.length}`);
  cp.forEach((b, i) => assert.equal(b.order, i + 1, `critical-path order gap at index ${i}`));
  // Ordered by levelCap (the placement level for both battle and progression beats).
  for (let i = 1; i < cp.length; i++) assert.ok(cp[i].levelCap >= cp[i - 1].levelCap, `critical-path level regression at beat ${cp[i].order}`);
  const registry = new Set(((readJson("games/emerald/locations.json") as any[]) ?? []).map((l) => l.slug));
  const milestoneSlugs = new Set((story.milestones ?? []).map((m: any) => m.slug));
  const seenKinds = new Set<string>();
  for (const b of cp) {
    seenKinds.add(b.kind);
    assert.ok(b.levelCap > 0, `beat ${b.order} has no levelCap`);
    if (b.location) assert.ok(registry.has(b.location), `beat ${b.order} location '${b.location}' not in the registry`);
    switch (b.kind) {
      case "gym": case "elite-four": case "champion":
        assert.ok(milestoneSlugs.has(b.milestone), `beat ${b.order} milestone '${b.milestone}' matches no milestone`); break;
      case "villain": case "rival":
        assert.ok(b.name, `beat ${b.order} (${b.kind}) has no name`); break;
      case "hm":
        assert.ok(machineCode(b.hm) && b.move, `beat ${b.order} hm '${b.hm}' unresolved`); break;
      case "legendary":
        assert.ok(pokemon.has(b.pokemon), `beat ${b.order} legendary '${b.pokemon}' unknown`); break;
      case "item":
        assert.ok(items.has(b.item), `beat ${b.order} item '${b.item}' unknown`); break;
      default:
        assert.fail(`beat ${b.order} unknown kind '${b.kind}'`);
    }
  }
  // The path is genuinely enriched beyond battles.
  for (const k of ["hm", "legendary", "item"]) assert.ok(seenKinds.has(k), `critical path has no ${k} beats`);
});

test("emerald connections: field-move requirements resolve to moves", () => {
  for (const [slug, node] of Object.entries<any>(connections)) {
    for (const fm of node.fieldMoves ?? []) assert.ok(moveByNorm.has(norm(fm)), `${slug}: field move '${fm}' has no move record`);
  }
});

test("locations registry: covers every location the game data references", () => {
  const registry = new Set(((readJson("games/emerald/locations.json") as any[]) ?? []).map((l) => l.slug));
  assert.ok(registry.size >= 60, `locations registry too small: ${registry.size}`);
  const referenced = new Set<string>();
  for (const t of trainers) if (t.location) referenced.add(t.location);
  for (const g of gifts) if (g.location) referenced.add(g.location);
  for (const l of (story.locations ?? []) as any[]) referenced.add(l.slug);
  for (const b of (story.criticalPath ?? []) as any[]) if (b.location) referenced.add(b.location);
  const missing = [...referenced].filter((s) => !registry.has(s));
  assert.deepEqual(missing, [], `locations referenced but not in the registry: ${missing.join(", ")}`);
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
