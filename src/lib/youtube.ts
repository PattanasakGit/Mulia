const ID = /^[\w-]{11}$/;

function videoIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const markers = new Set(["embed", "shorts", "live", "v"]);
  const index = parts.findIndex((part) => markers.has(part));
  const candidate = index >= 0 ? parts[index + 1] : undefined;
  return candidate && ID.test(candidate) ? candidate : null;
}

export function parseYoutubeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const allowed =
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be";

  if (!allowed) return null;

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && ID.test(id) ? id : null;
  }

  const queryId = url.searchParams.get("v");
  if (queryId && ID.test(queryId)) return queryId;
  return videoIdFromPath(url.pathname);
}

export function safeThumbnail(url: string | undefined, youtubeId: string) {
  const fallback = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const trusted =
      parsed.protocol === "https:" &&
      (host.endsWith("ytimg.com") ||
        host.endsWith("googleusercontent.com") ||
        host.endsWith("youtube.com"));
    return trusted ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}
