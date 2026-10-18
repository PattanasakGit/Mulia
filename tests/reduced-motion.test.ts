import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const template = readFileSync(path.join(root, "src/app/template.tsx"), "utf8");

describe("route fade respects prefers-reduced-motion", () => {
  it("template wraps pages in .page-fade", () => {
    expect(template).toMatch(/className="page-fade"/);
  });
  it("reduce media block forces .page-fade opacity to 1 with !important", () => {
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    expect(blocks.some((b) => /\.page-fade\s*\{\s*opacity:\s*1\s*!important;?\s*\}/.test(b))).toBe(true);
  });
});

describe("motion/react honours prefers-reduced-motion app-wide", () => {
  const motionSrc = readFileSync(path.join(root, "src/components/motion.tsx"), "utf8");
  const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  it("MotionRoot skips all motion animations when reduce is set", () => {
    expect(motionSrc).toMatch(/reducedMotion="user"/);
    expect(motionSrc).toMatch(/skipAnimations=\{reduce\}/);
  });
  it("root layout wraps the whole app in MotionRoot", () => {
    expect(layout).toMatch(/<MotionRoot>[\s\S]*\{children\}[\s\S]*<\/MotionRoot>/);
  });
  it("reduce block disables CSS animations and transitions", () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(block).toMatch(/animation:\s*none\s*!important/);
    expect(block).toMatch(/transition:\s*none\s*!important/);
  });
});

describe("reduced motion renders the shown state immediately (initial={false})", () => {
  it("fadeUp(…, skip) drops the hidden initial state", async () => {
    const { fadeUp } = await import("@/components/motion");
    expect(fadeUp(0, true).initial).toBe(false);
    expect(fadeUp(0.1).initial).toEqual({ opacity: 0, y: 12 });
  });
  it("every motion `initial=` prop is gated on reduced motion (AST check)", async () => {
    // Parses the TSX (formatting/variable names don't matter). A motion.* element's `initial`
    // passes if it is literally `false`, or a conditional `cond ? false : …` / `cond ? … : false`
    // whose condition uses a variable assigned from useReducedMotion(), or a fadeUp(…, <that>)
    // spread. AnimatePresence's own `initial` is a different prop and is ignored.
    const ts = (await import("typescript")).default;
    const { readdirSync } = await import("node:fs");
    const files = [
      ...readdirSync(path.join(root, "src/components")).map((f) => `src/components/${f}`),
      "src/app/template.tsx",
    ].filter((f) => f.endsWith(".tsx"));
    const ungated: string[] = [];
    let checked = 0;
    for (const f of files) {
      const src = ts.createSourceFile(f, readFileSync(path.join(root, f), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const reduceVars = new Set<string>();
      const collect = (n: import("typescript").Node) => {
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && /useReducedMotion\(\)/.test(n.initializer.getText(src))) reduceVars.add(n.name.text);
        ts.forEachChild(n, collect);
      };
      collect(src);
      const usesReduce = (e: import("typescript").Node): boolean => {
        let hit = false;
        const walk = (n: import("typescript").Node) => {
          if (ts.isIdentifier(n) && reduceVars.has(n.text)) hit = true;
          ts.forEachChild(n, walk);
        };
        walk(e);
        return hit;
      };
      const isFalse = (e: import("typescript").Expression) => e.kind === ts.SyntaxKind.FalseKeyword;
      const visit = (n: import("typescript").Node) => {
        if (ts.isJsxAttribute(n) && n.name.getText(src) === "initial") {
          const tag = (n.parent.parent as import("typescript").JsxOpeningLikeElement).tagName.getText(src);
          if (tag.startsWith("motion.")) {
            checked += 1;
            const init = n.initializer;
            let e = init && ts.isJsxExpression(init) ? init.expression : undefined;
            while (e && ts.isParenthesizedExpression(e)) e = e.expression;
            const ok =
              !!e &&
              (isFalse(e) ||
                (ts.isConditionalExpression(e) && usesReduce(e.condition) && (isFalse(e.whenTrue) || isFalse(e.whenFalse))));
            if (!ok) ungated.push(`${f}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
          }
        }
        if (ts.isJsxSpreadAttribute(n) && /^fadeUp\(/.test(n.expression.getText(src))) {
          checked += 1;
          const call = n.expression as import("typescript").CallExpression;
          if (!(call.arguments[1] && usesReduce(call.arguments[1]))) ungated.push(`${f}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1} (fadeUp)`);
        }
        ts.forEachChild(n, visit);
      };
      visit(src);
    }
    expect(checked).toBeGreaterThan(10);
    expect(ungated).toEqual([]);
  });
});
