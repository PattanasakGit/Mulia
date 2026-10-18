"use client";

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * A page's record is copied over itself, grows until it covers the viewport, and shrinks into the
 * record on the next page. Navigation happens while the record covers the screen. The home record
 * lands on the chooser; the chooser's record lands on the room player.
 */

type Destination = "catalog" | "player";
type Go = (href: string, from?: Element | null, destination?: Destination) => void;
const CurtainContext = createContext<Go>((href) => {
  window.location.assign(href);
});

export function useCurtain() {
  return useContext(CurtainContext);
}

// Pages that arrive behind the record hold their own entrance until it has landed.
let arriving = false;
export function curtainArriving() {
  return arriving;
}

const OPEN_MS = 900;
const CLOSE_MS = 1100;
const HANDOFF_MS = 280;
const OPEN_EASE = "cubic-bezier(0.76, 0, 0.2, 1)";
const CLOSE_EASE = "cubic-bezier(0.7, 0, 0.12, 1)";
const GUARD_MS = 9000;
const SPIN_MS = 3600;

const angleOf = (el: Element | null, pseudo?: string) => {
  if (!el) return 0;
  const m = new DOMMatrixReadOnly(getComputedStyle(el, pseudo).transform);
  return Math.atan2(m.b, m.a);
};

export function CurtainProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const busy = useRef(false);

  const go = useCallback<Go>(
    (href, from, targetKind = "catalog") => {
      if (busy.current) return;
      const source = targetKind === "player" ? from : from?.querySelector(".turntable");
      if (!source || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(href);
        return;
      }
      busy.current = true;
      arriving = true;
      const html = document.documentElement;

      // 1. copy the record over itself, then hide the original in the same task: no flash, no shift
      const start = source.getBoundingClientRect();
      const startAngle = angleOf(source.querySelector(".disc"));
      const startOpacity = Number.parseFloat(getComputedStyle(source).opacity);
      const root = document.createElement("div");
      root.className = "curtain";
      root.setAttribute("aria-hidden", "true");
      // Paper-coloured veil lets the next page appear as the record shrinks.
      const veil = document.createElement("span");
      veil.className = "curtain-veil";
      root.append(veil);
      const holder = document.createElement("div");
      // Keep the home record's styles on its copy; its float animation stays behind.
      holder.className = targetKind === "player" ? "curtain-record" : "home-disc curtain-record";
      Object.assign(holder.style, {
        left: `${start.left}px`,
        top: `${start.top}px`,
        width: `${start.width}px`,
        height: `${start.height}px`,
      });
      const copy = source.cloneNode(true) as HTMLElement;
      if (targetKind === "player") {
        copy.className = "catalog-record curtain-source";
      }
      for (const part of copy.querySelectorAll<HTMLElement>(".disc, .label")) {
        // Keep the original angle at pickup, then spin continuously through both phases.
        part.style.animation = "none";
        part.style.transform = `rotate(${startAngle}rad)`;
        part.animate(
          [{ transform: `rotate(${startAngle}rad)` }, { transform: `rotate(${startAngle + Math.PI * 2}rad)` }],
          { duration: SPIN_MS, easing: "linear", iterations: Infinity },
        );
      }
      const destination = document.createElement("div");
      destination.className = targetKind === "player" ? "curtain-player" : "catalog-record curtain-destination";
      holder.append(copy, destination);
      root.append(holder);
      document.body.append(root);
      const original = from as HTMLElement;
      const sourceVisibility = original.style.visibility;
      original.style.visibility = "hidden";
      html.classList.add("is-curtain");

      let finished = false;
      let timer = 0;
      let frame = 0;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        window.clearTimeout(guard);
        cancelAnimationFrame(frame);
        arriving = false;
        busy.current = false;
        html.classList.remove("is-curtain");
        original.style.visibility = sourceVisibility;
        root.remove();
      };
      // never leave a record hanging over the page if something goes wrong on the way
      const guard = window.setTimeout(cleanup, GUARD_MS);

      // 2. move the source record to the centre and grow it beyond every viewport corner
      const centreX = innerWidth / 2;
      const centreY = innerHeight / 2;
      const originX = start.left + start.width / 2;
      const originY = start.top + start.height / 2;
      const openX = centreX - originX;
      const openY = centreY - originY;
      const coverScale = (Math.hypot(innerWidth, innerHeight) * 1.12) / start.width;
      const coveredTransform = `translate(${openX}px, ${openY}px) scale(${coverScale})`;
      router.prefetch(href);
      const open = holder.animate(
        [{ transform: "translate(0px, 0px) scale(1)" }, { transform: coveredTransform }],
        { duration: OPEN_MS, easing: OPEN_EASE, fill: "forwards" },
      );
      if (targetKind === "player") {
        holder.animate([{ opacity: startOpacity }, { opacity: 1 }], { duration: OPEN_MS * 0.55, easing: "ease-out", fill: "forwards" });
      }
      copy.querySelector<HTMLElement>(".monogram-letter")?.animate(
        [{ opacity: 1 }, { opacity: 0, offset: 0.72 }, { opacity: 0 }],
        { duration: OPEN_MS, easing: "ease-out", fill: "forwards" },
      );
      veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-in", fill: "forwards" });
      let covered = false;
      open.onfinish = () => {
        covered = true;
        router.push(href);
      };

      // 3. once the destination record exists, shrink into its measured position
      const wanted = href.split("?")[0];
      const targetSelector = targetKind === "player" ? ".deck-player .turntable" : ".catalog > .catalog-record";
      const poll = () => {
        if (finished) return;
        if (!covered || location.pathname !== wanted) {
          frame = requestAnimationFrame(poll);
          return;
        }
        if (!document.querySelector(targetSelector)) {
          if (targetKind === "player" && document.querySelector(".anteroom-inner")) return cleanup();
          frame = requestAnimationFrame(poll);
          return;
        }
        timer = window.setTimeout(travel, 140);
      };

      const travel = () => {
        if (finished) return;
        const targetElement = document.querySelector(targetSelector);
        const target = targetElement?.getBoundingClientRect();
        const end = target && target.width > 0 ? target : null;
        if (!targetElement || !end) return cleanup();
        const destinationOpacity = targetKind === "player"
          ? 1
          : Number.parseFloat(getComputedStyle(targetElement).getPropertyValue("--rest-opacity")) || 1;
        if (targetKind === "player") {
          const player = targetElement.cloneNode(true) as HTMLElement;
          player.querySelectorAll("iframe, .yt-park").forEach((element) => element.remove());
          destination.append(player);
        } else {
          const record = targetElement.querySelector(".turntable")?.cloneNode(true);
          if (record) destination.append(record);
        }
        for (const selector of [".disc", ".label"]) {
          const realPart = targetElement.querySelector<HTMLElement>(selector);
          const copiedPart = destination.querySelector<HTMLElement>(selector);
          if (!realPart || !copiedPart) continue;
          const style = getComputedStyle(realPart);
          copiedPart.style.animation = "none";
          copiedPart.style.transform = style.transform;
          if (style.animationPlayState === "running") {
            const angle = angleOf(realPart);
            copiedPart.animate(
              [{ transform: `rotate(${angle}rad)` }, { transform: `rotate(${angle + Math.PI * 2}rad)` }],
              { duration: Number.parseFloat(style.animationDuration) * 1000 || 7000, easing: "linear", iterations: Infinity },
            );
          }
        }
        const scale = end.width / start.width;
        const dx = end.left + end.width / 2 - (start.left + start.width / 2);
        const dy = end.top + end.height / 2 - (start.top + start.height / 2);
        const options: KeyframeAnimationOptions = { duration: CLOSE_MS, easing: CLOSE_EASE, fill: "forwards" };
        const move = holder.animate(
          [
            { transform: coveredTransform },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          ],
          options,
        );
        // The next page comes into view as its record lands.
        veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS * 0.9, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" });
        // Crossfade the artwork while small, so the handoff to the real record has no design jump.
        copy.animate([{ opacity: 1 }, { opacity: 1, offset: 0.58 }, { opacity: 0 }], options);
        destination.animate([{ opacity: 0 }, { opacity: 0, offset: 0.58 }, { opacity: destinationOpacity }], options);
        move.onfinish = () => {
          // hand over: the real record fades in underneath while the copy dissolves
          html.classList.remove("is-curtain");
          arriving = false;
          const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HANDOFF_MS, easing: "ease-out", fill: "forwards" });
          fade.onfinish = cleanup;
        };
      };
      frame = requestAnimationFrame(poll);
    },
    [router],
  );

  return <CurtainContext.Provider value={go}>{children}</CurtainContext.Provider>;
}
