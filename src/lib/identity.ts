import { animalFromSeed, isAnimal, randomAnimal } from "@/lib/animals";
import { hueFromName } from "@/lib/hue";
import type { Identity } from "@/lib/types";

const KEY = "sound-index-identity";

export function readIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (!parsed.id || !parsed.name) return null;
    const emoji = isAnimal(parsed.emoji) ? parsed.emoji : animalFromSeed(parsed.id);
    const identity: Identity = {
      id: parsed.id,
      name: parsed.name,
      hue: hueFromName(parsed.name),
      emoji,
    };
    if (!isAnimal(parsed.emoji)) {
      window.localStorage.setItem(KEY, JSON.stringify(identity));
    }
    return identity;
  } catch {
    return null;
  }
}

export function writeIdentity(name: string, emoji?: string): Identity {
  const existing = readIdentity();
  const identity: Identity = {
    id: existing?.id ?? crypto.randomUUID(),
    name: name.trim().replace(/\s+/g, " "),
    hue: hueFromName(name),
    emoji: isAnimal(emoji) ? emoji : (existing?.emoji ?? randomAnimal()),
  };
  window.localStorage.setItem(KEY, JSON.stringify(identity));
  window.dispatchEvent(new Event("sound-index-identity"));
  return identity;
}

export function readVolume() {
  if (typeof window === "undefined") return { volume: 100, muted: false };
  const raw = window.localStorage.getItem("sound-index-volume");
  const parsed = raw === null ? Number.NaN : Number(raw);
  const muted = window.localStorage.getItem("sound-index-muted") === "1";
  const volume = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  if (volume === 0 && !muted) return { volume: 100, muted: false };
  return { volume, muted };
}

export function writeVolume(volume: number, muted: boolean) {
  window.localStorage.setItem("sound-index-volume", String(volume));
  window.localStorage.setItem("sound-index-muted", muted ? "1" : "0");
}
