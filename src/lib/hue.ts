const PALETTE = [18, 28, 42, 152, 168, 198, 214, 262, 338];

export function hueFromName(name: string) {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? 28;
}

function grapheme(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segment = new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text);
    return [...segment][0]?.segment ?? "";
  }
  return Array.from(text)[0] ?? "";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => grapheme(part)).join("");
  return letters || "•";
}
