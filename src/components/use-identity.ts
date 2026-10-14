"use client";

import { useEffect, useState } from "react";
import { readIdentity } from "@/lib/identity";
import type { Identity } from "@/lib/types";

export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setIdentity(readIdentity());
    sync();
    window.addEventListener("sound-index-identity", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sound-index-identity", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return identity;
}
