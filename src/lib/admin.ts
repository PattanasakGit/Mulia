import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Admin rights come from a secret held on the server (MULIA_ADMIN_TOKEN, 16+ characters), never from
 * a display name. Unset or too short = no admin at all.
 */
export function isAdminToken(value: unknown) {
  const secret = process.env.MULIA_ADMIN_TOKEN;
  if (!secret || secret.length < 16 || typeof value !== "string" || !value) return false;
  return timingSafeEqual(digest(value), digest(secret));
}
