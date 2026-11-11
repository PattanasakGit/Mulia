import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const vinyl = readFileSync(path.join(root, "src/components/vinyl.tsx"), "utf8");

describe("MULIA-VINYL-01 record and tonearm", () => {
  it("room tonearm swings out to -28deg when not playing", () => {
    expect(css).toMatch(/\.tonearm-gold\.is-rest\s*\{\s*transform:\s*rotate\(-28deg\)/);
  });
  it("room record turns at 1.8s per revolution and pauses in place (no animation: none)", () => {
    expect(css).toMatch(/\.room-app \.deck-visual \.disc,\s*\n\.room-app \.deck-visual \.label \{ animation-duration: 1\.8s; \}/);
    expect(css).toMatch(/\.disc\.is-spinning, \.label\.is-spinning \{ animation-play-state: running; \}/);
  });
  it("spin and arm follow the real player state, not only the room status", () => {
    expect(vinyl).toMatch(/const moving = spinning && playerPlaying && !failure && rawOverlay === "idle"/);
    expect(vinyl).toMatch(/<TonearmGold spinning=\{moving\} \/>/);
    expect(vinyl).toMatch(/\$\{turning \? "is-spinning" : ""\}/);
  });
});
