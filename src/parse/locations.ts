// Parse a Serebii per-Pokémon Emerald "Location" string into structured
// (location, method) pairs. Serebii has no per-route Emerald encounter tables,
// so this per-Pokémon text — which IS Emerald-exact and method-annotated — is
// inverted into a route→Pokémon map (see derive/encounters.ts).
//
// Grammar (observed):
//   "Routes 111, 114 & 120, Meteor Falls (Fish), Route 118 (Surf)"
//   - comma/&-separated tokens; "Routes N, M & K" distributes "Route" over bare numbers
//   - a trailing "(qualifier)" applies to the group of tokens before it
//   - the qualifier is a method (Grass/Surf/Fish/Rod/Smash/Headbutt) or a sub-area (Desert)
// Best-effort: routes are extracted with high confidence; obscure sub-area
// numbers (e.g. "Basements 1 & 2") may be captured coarsely or dropped.

export interface Encounter {
  location: string;
  locationSlug: string;
  method: string; // walk | surf | fish | old-rod | good-rod | super-rod | rock-smash | headbutt
}

const METHODS: Array<[RegExp, string]> = [
  [/surf/i, "surf"],
  [/old rod/i, "old-rod"],
  [/good rod/i, "good-rod"],
  [/super rod/i, "super-rod"],
  [/rod|fish/i, "fish"],
  [/smash/i, "rock-smash"],
  [/headbutt/i, "headbutt"],
];

function methodOf(qualifier: string): string {
  for (const [re, m] of METHODS) if (re.test(qualifier)) return m;
  return "walk"; // grass / cave / default land encounter (and non-method qualifiers like "Desert")
}

export function slugifyLocation(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Non-wild acquisition prose ("Evolve Lairon", "Trade from FireRed", "Starter …").
// If a string reads as prose and names no Route, it is not a wild encounter.
const PROSE = /\b(trade|evolve|starter|gift|migrate|breed|purify|hatch|receive|reward|event|snag|obtained|colosseum)\b/i;

export function parseEmeraldLocations(text: string | undefined): Encounter[] {
  if (!text) return [];
  if (PROSE.test(text) && !/Route/i.test(text)) return [];

  // Split into groups: a text chunk followed by an optional "(qualifier)".
  const groups: Array<{ chunk: string; qual: string }> = [];
  let last = 0;
  const paren = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(text))) {
    groups.push({ chunk: text.slice(last, m.index), qual: m[1]! });
    last = paren.lastIndex;
  }
  if (last < text.length) groups.push({ chunk: text.slice(last), qual: "" });

  const out: Encounter[] = [];
  const seen = new Set<string>();
  const add = (location: string, method: string) => {
    const locationSlug = slugifyLocation(location);
    if (!locationSlug) return;
    const key = `${locationSlug}|${method}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ location, locationSlug, method });
  };

  for (const g of groups) {
    const method = methodOf(g.qual);
    // 1) Routes: "Route(s) N, M & K" — distribute "Route" across the number run.
    for (const rm of g.chunk.matchAll(/Routes?\s+([\d,\s&]+)/gi)) {
      for (const n of rm[1]!.split(/[,&\s]+/)) if (/^\d+$/.test(n)) add(`Route ${n}`, method);
    }
    // 2) Named locations: tokens with letters that aren't the route runs.
    const deRouted = g.chunk.replace(/Routes?\s+[\d,\s&]+/gi, ",");
    for (const tok of deRouted.split(/,|&/)) {
      const name = tok.replace(/\s+/g, " ").trim();
      if (name && /[A-Za-z]/.test(name) && !/^Route/i.test(name)) add(name, method);
    }
  }
  return out;
}
