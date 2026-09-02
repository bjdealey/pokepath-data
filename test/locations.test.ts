import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmeraldLocations } from "../src/parse/locations.ts";

const slugs = (t: string) => parseEmeraldLocations(t).map((e) => `${e.locationSlug}:${e.method}`);

test("single route", () => {
  assert.deepEqual(slugs("Route 120"), ["route-120:walk"]);
});

test("distributes Routes over a number run + named + method", () => {
  assert.deepEqual(
    slugs("Routes 111, 114 & 120, Meteor Falls, Victory Road Basement 2 (Fish)"),
    ["route-111:fish", "route-114:fish", "route-120:fish", "meteor-falls:fish", "victory-road-basement-2:fish"],
  );
});

test("two method groups (Grass then Surf)", () => {
  const r = parseEmeraldLocations("Routes 103, 104 & 110, Mt. Pyre (Grass), Routes 118 & 119, Slateport City (Surf)");
  assert.deepEqual(r.filter((e) => e.method === "walk").map((e) => e.locationSlug), ["route-103", "route-104", "route-110", "mt-pyre"]);
  assert.deepEqual(r.filter((e) => e.method === "surf").map((e) => e.locationSlug), ["route-118", "route-119", "slateport-city"]);
});

test("sub-area qualifier is not a method (Desert -> walk)", () => {
  assert.deepEqual(slugs("Route 111 (Desert)"), ["route-111:walk"]);
});

test("prose (non-wild) yields nothing", () => {
  assert.deepEqual(parseEmeraldLocations("Trade from FireRed/LeafGreen"), []);
  assert.deepEqual(parseEmeraldLocations("Evolve Lairon"), []);
});
