import { animalFromSeed, isAnimal, randomAnimal } from "@/lib/animals";
import { hueFromName } from "@/lib/hue";
import type { Identity } from "@/lib/types";
import { getItem, setItem } from "@/lib/storage";

const KEY = "sound-index-identity";

/** Pure parse of a stored identity string (no storage writes; safe during render). */
export function parseIdentity(raw: string | null): Identity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (!parsed.id || !parsed.name) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      hue: hueFromName(parsed.name),
      emoji: isAnimal(parsed.emoji) ? parsed.emoji : animalFromSeed(parsed.id),
    };
  } catch {
    return null;
  }
}

/** Read the stored identity; migrates one with a missing/invalid emoji (one write). */
export function readIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = getItem(KEY);
    const identity = parseIdentity(raw);
    if (identity && raw && !isAnimal((JSON.parse(raw) as Partial<Identity>).emoji)) {
      setItem(KEY, JSON.stringify(identity));
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
  setItem(KEY, JSON.stringify(identity));
  window.dispatchEvent(new Event("sound-index-identity"));
  return identity;
}

export function readVolume() {
  if (typeof window === "undefined") return { volume: 100, muted: false };
  const raw = getItem("sound-index-volume");
  const parsed = raw === null ? Number.NaN : Number(raw);
  const muted = getItem("sound-index-muted") === "1";
  const volume = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  if (volume === 0 && !muted) return { volume: 100, muted: false };
  return { volume, muted };
}

export function writeVolume(volume: number, muted: boolean) {
  setItem("sound-index-volume", String(volume));
  setItem("sound-index-muted", muted ? "1" : "0");
}
