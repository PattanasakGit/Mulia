"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export function Icon({ icon, size = 18 }: { icon: IconSvgElement; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} color="currentColor" strokeWidth={1.6} />;
}
