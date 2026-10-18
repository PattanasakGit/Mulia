"use client";

import { useSyncExternalStore } from "react";
import { getItem, setItem } from "@/lib/storage";
import type { SpeakerState } from "@/lib/types";

/**
 * What this device does in a room.
 *  speaker  — plays the sound (the room's main speaker in "single" mode)
 *  listener — plays the sound too (opted in, or any device in "all" mode)
 *  remote   — controls the room only: no player, no sound, no video traffic
 */
export type Role = "speaker" | "listener" | "remote";

export type Flags = { listen: boolean; remote: boolean };

export function resolveRole(speaker: SpeakerState | undefined, device: string, flags: Flags): Role {
  // older servers send no speaker block: every device plays, as before
  if (!speaker || speaker.mode === "all") return flags.remote ? "remote" : "listener";
  if (device && speaker.mainDeviceId === device) return "speaker";
  return flags.listen ? "listener" : "remote";
}

export const playsAudio = (role: Role) => role !== "remote";

// One id per tab (sessionStorage): two tabs of one browser must not both think they are the speaker,
// and a reload keeps the tab's role.
const DEVICE_KEY = "mulia-device";
let cachedDevice = "";

export function deviceId() {
  if (cachedDevice) return cachedDevice;
  try {
    const stored = window.sessionStorage.getItem(DEVICE_KEY);
    if (stored) return (cachedDevice = stored);
    const fresh = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    window.sessionStorage.setItem(DEVICE_KEY, fresh);
    return (cachedDevice = fresh);
  } catch {
    return (cachedDevice ||= crypto.randomUUID().replace(/-/g, "").slice(0, 24));
  }
}

const DEVICE_EVENT = "mulia-device-change";

/** "" while rendering on the server / hydrating, the tab's id afterwards. */
export function useDeviceId() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(DEVICE_EVENT, onChange);
      return () => window.removeEventListener(DEVICE_EVENT, onChange);
    },
    deviceId,
    () => "",
  );
}

function renewDeviceId() {
  const fresh = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  cachedDevice = fresh;
  try {
    window.sessionStorage.setItem(DEVICE_KEY, fresh);
  } catch {
    /* kept in memory for this page */
  }
  window.dispatchEvent(new Event(DEVICE_EVENT));
}

let lockHeld = "";

/**
 * "Duplicate tab" copies sessionStorage, so two tabs can share one device id and both play. Each
 * tab holds a Web Lock on its id for as long as it lives; a tab that cannot get it is a copy and
 * takes a fresh id. A reload gets the lock back as soon as the old page is gone (1.5s allowed).
 */
export function holdDeviceId() {
  if (typeof navigator === "undefined" || !navigator.locks) return;
  const id = deviceId();
  if (lockHeld === id) return;
  const abort = new AbortController();
  const giveUp = window.setTimeout(() => abort.abort(), 1500);
  navigator.locks
    .request(`mulia-device:${id}`, { signal: abort.signal }, () => {
      window.clearTimeout(giveUp);
      lockHeld = id;
      return new Promise<void>(() => undefined); // held until this page is closed
    })
    .catch(() => {
      window.clearTimeout(giveUp);
      renewDeviceId();
      holdDeviceId();
    });
}

const EVENT = "mulia-speaker-flags";
const listenKey = (code: string) => `mulia-listen:${code}`;
const remoteKey = (code: string) => `mulia-remote:${code}`;

export function writeFlag(kind: "listen" | "remote", code: string, on: boolean) {
  setItem(kind === "listen" ? listenKey(code) : remoteKey(code), on ? "1" : "0");
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** This device's own choices for one room ("listen along" in single mode, "stay remote" in all mode). */
export function useSpeakerFlags(code: string): Flags {
  const raw = useSyncExternalStore(
    subscribe,
    () => `${getItem(listenKey(code)) === "1" ? 1 : 0}${getItem(remoteKey(code)) === "1" ? 1 : 0}`,
    () => "00",
  );
  return { listen: raw[0] === "1", remote: raw[1] === "1" };
}
