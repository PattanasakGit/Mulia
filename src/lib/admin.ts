const SUPER_ADMIN = "THEPAT";

export function isSuperAdmin(name: unknown) {
  return typeof name === "string" && name.trim().toUpperCase() === SUPER_ADMIN;
}
