const ANIMALS = [
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
  "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉",
  "🐺", "🐴", "🦄", "🐝", "🦋", "🐢", "🐍", "🐙", "🐠", "🐬",
  "🐳", "🦈", "🐘", "🦒", "🦘", "🦝",   "🦦", "🦥", "🦔", "🐿️",
  "🦜", "🦩", "🦚", "🦢", "🐇", "🦌",
  "🦬", "🐃", "🐐", "🐑", "🦙", "🐪", "🦓", "🦛", "🦏", "🐊",
  "🦅", "🦃", "🕊️", "🦤", "🦭", "🦀", "🦞", "🦑", "🐡", "🪼",
] as const;

const UNIQUE = [...new Set(ANIMALS)];

const SET = new Set<string>(UNIQUE);

export function isAnimal(value: unknown): value is string {
  return typeof value === "string" && SET.has(value);
}

export function randomAnimal(exclude?: string) {
  const choices = exclude ? UNIQUE.filter((animal) => animal !== exclude) : UNIQUE;
  const index = Math.floor(Math.random() * choices.length);
  return choices[index] ?? "🦊";
}

export function animalFromSeed(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return UNIQUE[hash % UNIQUE.length] ?? "🦊";
}

export function animalOrSeed(value: unknown, seed: string) {
  return isAnimal(value) ? value : animalFromSeed(seed);
}
