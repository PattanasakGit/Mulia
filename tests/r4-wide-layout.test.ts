import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
const frame = css.slice(css.indexOf("exact 1440 frame"), css.indexOf("phone layout (mock <=600px rules)"));

describe("MULIA-FIX-R4 wide desktop layout (>=1280px)", () => {
  it("deck grows with the screen instead of stopping at 1440px", () => {
    expect(frame).toMatch(/\.room-app \.deck \{[^}]*max-width: 2400px;[^}]*margin-inline: auto;[^}]*height: 100%;/);
    expect(frame).toMatch(/grid-template-columns: minmax\(607px, 5fr\) minmax\(0, 7fr\)/);
    expect(frame).not.toMatch(/max-width: 1440px/);
  });
  it("player cluster is centred in its column, not pinned to the top", () => {
    expect(frame).toMatch(/\.room-app \.deck-player \{[^}]*justify-content: center;[^}]*align-items: center;/);
    expect(frame).not.toMatch(/justify-content: flex-start/);
    expect(frame).not.toMatch(/min-height: 662px/);
    expect(frame).toMatch(/\.room-app \.deck-visual \{[^}]*margin-inline: auto;[^}]*align-self: center;/);
  });
  it("keeps the R3 bounded queue (list scrolls inside the card)", () => {
    expect(frame).toMatch(/\.room-app \.deck-side \{[^}]*min-height: 0;[^}]*overflow: hidden/);
  });
});
