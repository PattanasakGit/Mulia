"use client";

import { useSyncExternalStore } from "react";
import { getItem, setItem } from "@/lib/storage";

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

export function useIsAdmin() {
  return useSyncExternalStore(subscribe, () => Boolean(getItem(ADMIN_KEY)), () => false);
}
