import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRouteTrainers, locationName } from "../src/parse/pokearth-trainers.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokearth-route110-3rd.html", import.meta.url)), "utf8");
const trainers = parseRouteTrainers(html, "route110");

test("captures the whole Emerald trainers-em roster, not just rival/villain", () => {
  assert.ok(trainers.length > 30, `expected many trainers, got ${trainers.length}`);
  assert.ok(trainers.some((t) => t.kind === "trainer"));
  assert.ok(trainers.some((t) => /Youngster Timmy/.test(t.label) && t.kind === "trainer"));
});

test("still tags + retains the rival with starter variants", () => {
  const rival = trainers.filter((t) => t.kind === "rival");
  assert.ok(rival.length >= 6);
  assert.deepEqual([...new Set(rival.map((t) => t.variant))].sort(), ["Mudkip Chosen", "Torchic Chosen", "Treecko Chosen"]);
});

test("regular trainer has a team with levels", () => {
  const timmy = trainers.find((t) => /Youngster Timmy/.test(t.label))!;
  assert.ok(timmy.team.length > 0);
  assert.ok(timmy.team.every((p) => p.level > 0 && p.pokemon));
});

test("reclassifies pokearth 'Gym Leader/Champion X' rows to their real kind + merged identity", () => {
  const html = `
    <a name="trainers-em"></a>
    <table class="trainer">
      <tr><td></td><td><img src="/pokedexbw/sprites/rs/304.png"></td></tr>
      <tr><td>Gym Leader Roxanne</td><td>Aron</td></tr>
      <tr><td></td><td>Level 40</td></tr>
    </table>
    <table class="trainer">
      <tr><td></td><td><img src="/pokedexbw/sprites/rs/260.png"></td></tr>
      <tr><td>Champion Wallace</td><td>Swampert</td></tr>
      <tr><td></td><td>Level 58</td></tr>
    </table>`;
  const [rox, wal] = parseRouteTrainers(html, "rustborocity");
  assert.equal(rox!.kind, "gym-leader");
  assert.equal(rox!.trainer, "roxanne"); // honorific stripped → merges with the gym-page Roxanne
  assert.equal(wal!.kind, "champion");
  assert.equal(wal!.trainer, "wallace");
});

test("locationName gives proper display names, including curated irregular ones", () => {
  // Algorithmic: routes and PLACE_WORDS suffixes.
  assert.equal(locationName("route110"), "Route 110");
  assert.equal(locationName("granitecave"), "Granite Cave");
  assert.equal(locationName("petalburgwoods"), "Petalburg Woods");
  // Curated: names the heuristic can't recover (of/prefix/unknown-suffix/initialism).
  assert.equal(locationName("caveoforigin"), "Cave of Origin");
  assert.equal(locationName("skypillar"), "Sky Pillar");
  assert.equal(locationName("newmauville"), "New Mauville");
  assert.equal(locationName("sstidal"), "S.S. Tidal");
  // None of the curated names should come back un-spaced.
  for (const slug of ["ancienttomb", "desertruins", "fierypath", "safarizone", "scorchedslab", "abandonedship"])
    assert.match(locationName(slug), / /, `${slug} should be de-smashed`);
});
