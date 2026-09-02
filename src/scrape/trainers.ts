// Scrape Emerald gym leaders + Elite Four/Champion into trainers + a story
// (progression) spine. Rosters come from table.trainer; gym metadata (city,
// badge, TM, field-move unlock) from the page's "Method:" prose.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchCached } from "../fetch.ts";
import { parseTrainerRosters, parseGymProgression, parseEliteProgression, trainerSlug } from "../parse/trainers.ts";
import type { StoryStep, Trainer } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));
const GYM_URL = "https://www.serebii.net/emerald/gym.shtml";
const ELITE_URL = "https://www.serebii.net/emerald/elite.shtml";

const levelCap = (team: { level: number }[]) => team.reduce((mx, p) => Math.max(mx, p.level), 0);

export async function scrapeTrainers(refresh = false) {
  const gymHtml = await fetchCached(GYM_URL, { refresh });
  const eliteHtml = await fetchCached(ELITE_URL, { refresh });

  const gymRosters = parseTrainerRosters(gymHtml);
  const eliteRosters = parseTrainerRosters(eliteHtml);
  const gymMeta = parseGymProgression(gymHtml);
  const eliteMeta = parseEliteProgression(eliteHtml);

  const trainers: Trainer[] = [];
  const story: StoryStep[] = [];

  // Gyms: pair the i-th roster with the i-th gym metadata.
  gymRosters.forEach((r, i) => {
    const meta = gymMeta[i];
    const slug = trainerSlug(r.name);
    trainers.push({
      slug, name: r.name, class: "Gym Leader",
      location: meta?.location, specialty: meta?.specialty, badge: meta?.badge, team: r.team,
    });
    story.push({
      order: i + 1, kind: "gym", name: r.name, slug,
      city: meta?.city, location: meta?.location, specialty: meta?.specialty,
      badge: meta?.badge, tmReward: meta?.tmReward, fieldMove: meta?.fieldMove,
      levelCap: levelCap(r.team),
    });
  });

  // Elite Four (first N rosters) + Champion (the last one).
  const champ = eliteRosters.length > eliteMeta.length ? eliteRosters[eliteRosters.length - 1] : undefined;
  eliteRosters.forEach((r, i) => {
    const slug = trainerSlug(r.name);
    const isChamp = r === champ;
    const meta = isChamp ? undefined : eliteMeta[i];
    trainers.push({
      slug, name: r.name, class: isChamp ? "Champion" : "Elite Four",
      specialty: meta?.specialty, team: r.team,
    });
    story.push({
      order: gymRosters.length + i + 1,
      kind: isChamp ? "champion" : "elite-four",
      name: r.name, slug, specialty: meta?.specialty, levelCap: levelCap(r.team),
    });
  });

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}trainers.json`, JSON.stringify(trainers, null, 2));
  await writeFile(`${dir}story.json`, JSON.stringify(story, null, 2));

  return { trainers: trainers.length, story: story.length };
}
