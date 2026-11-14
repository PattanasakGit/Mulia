"use client";

import { useSyncExternalStore } from "react";
import { getItem, removeItem, setItem } from "@/lib/storage";

/**
 * Proof of ownership for closing a room. The server hands the owner token out once, when the room is
 * created; this device keeps it per room code. An admin keeps MULIA_ADMIN_TOKEN under ADMIN_KEY.
 */
const ADMIN_KEY = "mulia-admin-token";
const EVENT = "mulia-owner-change";
const ownerKey = (code: string) => `mulia-owner:${code.toUpperCase()}`;

export function saveOwnerToken(code: string, token: string) {
  setItem(ownerKey(code), token);
  window.dispatchEvent(new Event(EVENT));
}

/** This device lost ownership (the server said 403 for its token): stop offering owner actions. */
export function forgetOwnerToken(code: string) {
  removeItem(ownerKey(code));
  window.dispatchEvent(new Event(EVENT));
}

export const RECOVERY_PREFIX = "#owner=";

/** A recovery token has to survive a hop through /enter, so it waits here (memory only, never storage). */
const pendingRecovery = new Map<string, string>();

/**
 * Take a recovery token out of the address bar. The fragment is removed from the URL straight away
 * (history, screenshots, shared screens), whatever the outcome.
 */
export function captureRecoveryFragment(code: string) {
  const hash = window.location.hash;
  if (hash.startsWith(RECOVERY_PREFIX)) {
    const token = decodeURIComponent(hash.slice(RECOVERY_PREFIX.length)).slice(0, 128);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (token) pendingRecovery.set(code.toUpperCase(), token);
  }
  return pendingRecovery.get(code.toUpperCase()) ?? null;
}

export function dropPendingRecovery(code: string) {
  pendingRecovery.delete(code.toUpperCase());
}

export function hasOwnerToken(code: string) {
  return Boolean(getItem(ownerKey(code)));
}

/** Credentials to send with a close request (empty strings when this device holds none). */
export function closeCredentials(code: string) {
  return { ownerToken: getItem(ownerKey(code)) ?? "", adminToken: getItem(ADMIN_KEY) ?? "" };
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True when this device may try to close the room. The server still decides. */
export function useCanClose(code: string) {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(getItem(ownerKey(code)) || getItem(ADMIN_KEY)),
    () => false,
  );
}

/** True when this device holds this room's owner token (an admin token alone does not count). */
export function useHasOwnerToken(code: string) {
  return useSyncExternalStore(subscribe, () => hasOwnerToken(code), () => false);
}

export function useIsAdmin() {
  return useSyncExternalStore(subscribe, () => Boolean(getItem(ADMIN_KEY)), () => false);
}
