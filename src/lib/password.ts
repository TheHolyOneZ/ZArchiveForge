

export interface GenOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};

export const DEFAULT_GEN: GenOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
};


function randIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

function pick(alphabet: string): string {
  return alphabet[randIndex(alphabet.length)];
}


function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randIndex(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


export function generatePassword(opts: GenOptions): string {
  const enabled = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => opts[k]);
  if (enabled.length === 0) return "";

  const length = Math.max(1, Math.min(128, Math.floor(opts.length) || 1));
  const pool = enabled.map((k) => SETS[k]).join("");

  const chars: string[] = [];

  for (const k of enabled) {
    if (chars.length < length) chars.push(pick(SETS[k]));
  }
  while (chars.length < length) chars.push(pick(pool));

  return shuffle(chars).join("");
}
