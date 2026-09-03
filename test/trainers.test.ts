import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTrainerRosters, parseGymProgression, aliasMoveName } from "../src/parse/trainers.ts";

const gym = readFileSync(fileURLToPath(new URL("./fixtures/emerald-gym.html", import.meta.url)), "utf8");
const rosters = parseTrainerRosters(gym);
const progression = parseGymProgression(gym);

test("parses 8 gym rosters", () => {
  assert.equal(rosters.length, 8);
});

test("Roxanne's team (roster 0)", () => {
  const roxanne = rosters[0]!;
  assert.equal(roxanne.name, "Roxanne");
  assert.deepEqual(roxanne.team.map((p) => p.pokemon), ["geodude", "geodude", "nosepass"]);
  const nosepass = roxanne.team[2]!;
  assert.equal(nosepass.natdex, 299);
  assert.equal(nosepass.level, 15);
  assert.equal(nosepass.heldItem, "Oran Berry");
  assert.ok(nosepass.moves?.includes("Rock Tomb"));
});

test("gym-1 progression metadata + field-move unlock", () => {
  const g1 = progression[0]!;
  assert.equal(g1.order, 1);
  assert.equal(g1.name, "Roxanne");
  assert.match(g1.city ?? "", /Rustboro/);
  assert.equal(g1.specialty, "Rock");
  assert.equal(g1.badge, "Stone Badge");
  assert.equal(g1.tmReward, "TM39");
  assert.equal(g1.fieldMove, "Cut");
});

test("all 8 gyms have a badge", () => {
  assert.equal(progression.length, 8);
  assert.ok(progression.every((g) => /Badge$/.test(g.badge ?? "")));
});

test("gym-page move names are aliased to their Gen-3 name so they join move records", () => {
  assert.equal(aliasMoveName("Feint Attack"), "Faint Attack"); // Gen-6 name → Gen-3 (slug faintattack)
  assert.equal(aliasMoveName("Tackle"), "Tackle"); // untouched
  // No roster should still carry the un-aliased "Feint Attack" after parsing.
  assert.ok(!rosters.some((r) => r.team.some((p) => p.moves?.includes("Feint Attack"))));
});
