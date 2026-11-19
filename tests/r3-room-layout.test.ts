import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const css = read("src/app/globals.css");
const room = read("src/components/room-stage.tsx");
const volume = read("src/components/volume-control.tsx");

/** Body of the first rule whose selector line matches, inside the given media query text. */
function mediaBlock(query: string) {
  const start = css.indexOf(`@media ${query} {`);
  expect(start, query).toBeGreaterThan(-1);
  return css.slice(start, start + 6000);
}

describe("MULIA-FIX-R3 queue stays bounded (list scrolls, page does not stretch)", () => {
  it("desktop: room box has a bounded height and the deck row/side cannot grow with the queue", () => {
    const block = mediaBlock("(min-width: 981px)");
    expect(block).toMatch(/\.room-app \{[^}]*height: max\(100dvh, 780px\)/);
    expect(block).toMatch(/grid-template-rows: minmax\(0, 1fr\)/);
    expect(block).toMatch(/\.room-app \.deck-side \{[^}]*min-height: 0;[^}]*overflow: hidden/);
  });
  it("1280+ frame does not re-introduce a growing deck-side", () => {
    const frame = css.slice(css.indexOf("exact 1440 frame"));
    expect(frame).toMatch(/\.room-app \.deck-side \{[^}]*min-height: 0;[^}]*overflow: hidden/);
  });
  it("phone/tablet: queue stage has a fixed height and the list scrolls inside", () => {
    const block = mediaBlock("(max-width: 980px)");
    expect(block).toMatch(/\.room-app \.queue-stage \{[^}]*height: min\(520px, 62dvh\);[^}]*flex: none/);
    expect(css).toMatch(/@media \(max-width: 600px\) \{\s*\.room-app \.deck-player[\s\S]*?\.room-app \.queue-stage \{\s*min-height: 0;\s*flex: none;/);
    expect(css).toMatch(/\.queue \{[^}]*overflow-y: auto/);
  });
});

describe("MULIA-FIX-R3 seek bar", () => {
  it("room passes onSeek (not readOnly) to Progress and sends the seek command", () => {
    const usage = room.slice(room.indexOf("<Progress"), room.indexOf("/>", room.indexOf("<Progress")));
    expect(usage).not.toMatch(/\breadOnly\b/);
    expect(usage).toMatch(/command\("seek", \{ positionMs \}\)/);
  });
});

describe("MULIA-FIX-R3 volume slider stays open while dragging", () => {
  it("ignores the synthetic pointerdown Vinyl.release() fires on the iframe", () => {
    expect(volume).toMatch(/if \(!event\.isTrusted\) return;/);
  });
});

describe("MULIA-FIX-R3 navbar and add-URL field", () => {
  it("room navbar paints the page colour", () => {
    expect(css).toMatch(/\.room-app \.topbar \{[^}]*background: var\(--page\);[^}]*backdrop-filter: none/);
  });
  it("add-URL button lives inside the pill with a plus circle and the 'add to queue' label", () => {
    const pill = room.slice(room.indexOf('className="add-row"'), room.indexOf("</form>"));
    expect(pill.indexOf('className="add-go"')).toBeGreaterThan(pill.indexOf("<input"));
    expect(pill).toMatch(/add-go-plus/);
    expect(pill).toMatch(/เพิ่มเข้าคิว/);
    expect(pill).not.toMatch(/add-queue-btn/);
    expect(pill).toMatch(/disabled=\{!url\.trim\(\)\}/);
  });
});
