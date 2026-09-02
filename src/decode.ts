// Serebii pages are UTF-8 but contain occasional stray Windows-1252 bytes
// (notably 0xE9 = "é" in "Pokémon"/"Poké Ball"). A plain UTF-8 decode turns
// those lone bytes into U+FFFD and loses them. This decoder keeps valid
// multi-byte UTF-8 sequences (e.g. Japanese katakana) intact and maps any byte
// that is NOT part of a valid sequence through Latin-1, so "é" is preserved.
const utf8 = new TextDecoder("utf-8", { fatal: true });

function validSequence(b: Uint8Array, i: number, len: number): boolean {
  if (i + len > b.length) return false;
  for (let k = 1; k < len; k++) {
    const x = b[i + k];
    if (x === undefined || (x & 0xc0) !== 0x80) return false; // not a continuation byte
  }
  return true;
}

export function decodeMixed(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const n = b.length;
  let out = "";
  let segStart = 0; // start of a pending Latin-1 run (ASCII + stray high bytes)
  const flush = (end: number) => {
    if (end > segStart) out += Buffer.from(b.subarray(segStart, end)).toString("latin1");
  };
  let i = 0;
  while (i < n) {
    const c = b[i]!;
    const len = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 0;
    if (len && validSequence(b, i, len)) {
      flush(i);
      out += utf8.decode(b.subarray(i, i + len));
      i += len;
      segStart = i;
    } else {
      i += 1; // ASCII or stray byte — folded into the Latin-1 run
    }
  }
  flush(n);
  return out;
}
