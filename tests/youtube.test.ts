import { describe, expect, it } from "vitest";
import { parseYoutubeUrl, safeThumbnail } from "@/lib/youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeUrl", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&list=RD`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://www.youtube.com/v/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])("accepts %s", (url) => expect(parseYoutubeUrl(url)).toBe(ID));

  it.each([
    [""],
    ["   "],
    ["not a url"],
    [ID],
    [`https://vimeo.com/${ID}`],
    [`https://evilyoutube.com/watch?v=${ID}`],
    [`https://youtube.com.evil.com/watch?v=${ID}`],
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/watch?v=toolongvideoid1"],
    ["https://youtu.be/"],
    ["https://youtu.be/bad!id!!!!"],
    ["https://www.youtube.com/channel/UC123"],
    ["https://www.youtube.com/embed/"],
  ])("rejects %s", (url) => expect(parseYoutubeUrl(url)).toBeNull());

  it("prefers ?v= over path marker", () => {
    expect(parseYoutubeUrl(`https://youtube.com/embed/aaaaaaaaaaa?v=${ID}`)).toBe(ID);
  });
  it("falls back to path when ?v= is invalid", () => {
    expect(parseYoutubeUrl(`https://youtube.com/embed/${ID}?v=bad`)).toBe(ID);
  });
});

describe("safeThumbnail", () => {
  const fallback = `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`;
  it("falls back when missing/invalid/http/untrusted", () => {
    expect(safeThumbnail(undefined, ID)).toBe(fallback);
    expect(safeThumbnail("::", ID)).toBe(fallback);
    expect(safeThumbnail("http://i.ytimg.com/x.jpg", ID)).toBe(fallback);
    expect(safeThumbnail("https://evil.com/x.jpg", ID)).toBe(fallback);
    expect(safeThumbnail("javascript:alert(1)", ID)).toBe(fallback);
  });
  it("keeps trusted https hosts", () => {
    for (const url of [
      "https://i.ytimg.com/vi/x/mq.jpg",
      "https://lh3.googleusercontent.com/a.jpg",
      "https://www.youtube.com/img.jpg",
    ]) expect(safeThumbnail(url, ID)).toBe(url);
  });
  // group B (intentional): ytimg endsWith check
  it("CURRENT BEHAVIOUR: suffix match also trusts look-alike hosts", () => {
    expect(safeThumbnail("https://evilytimg.com/x.jpg", ID)).toBe("https://evilytimg.com/x.jpg");
  });
});
