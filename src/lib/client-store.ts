"use client";

import { useSyncExternalStore } from "react";
import { randomAnimal } from "@/lib/animals";
import { getItem } from "@/lib/storage";

/**
 * Hydration-safe reads of browser-only values. Each returns the same value the
 * old `useState(default) + useEffect(() => setState(browserValue))` pattern did:
 * the server/hydration render sees the default, the client then sees the browser value.
 */
const never = () => () => undefined;

export function useHydrated() {
  return useSyncExternalStore(never, () => true, () => false);
}

export function useOrigin() {
  return useSyncExternalStore(never, () => window.location.origin, () => "");
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}

function subscribeIdentity(onChange: () => void) {
  window.addEventListener("sound-index-identity", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("sound-index-identity", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Raw stored identity string (stable across renders for useSyncExternalStore). */
export function useStoredIdentityRaw() {
  return useSyncExternalStore(
    subscribeIdentity,
    () => {
      try {
        return getItem("sound-index-identity");
      } catch {
        return null;
      }
    },
    () => null,
  );
}

let pageAnimal: string | null = null;
/** One random animal per page load (client only); "" during SSR/hydration. */
export function useRandomAnimal() {
  return useSyncExternalStore(
    never,
    () => (pageAnimal ??= randomAnimal()),
    () => "",
  );
}
