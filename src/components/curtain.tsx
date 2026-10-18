"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * Home → room chooser, as one gesture: a record, rimmed in gold, opens out of the button until it
 * covers the screen, the next page loads underneath, and the record closes down into the record
 * that sits in the chooser's header. Nothing is shown from any room; it is only a way through.
 */

type Go = (href: string, from?: Element | null) => void;
const CurtainContext = createContext<Go>((href) => {
  window.location.assign(href);
});

export function useCurtain() {
  return useContext(CurtainContext);
}

// Pages that arrive behind the curtain hold their own entrance until the record has closed.
let arriving = false;
export function curtainArriving() {
  return arriving;
}

const OPEN_MS = 760;
const CLOSE_MS = 1050;
const OPEN_EASE = "cubic-bezier(0.7, 0, 0.2, 1)";
const CLOSE_EASE = "cubic-bezier(0.65, 0, 0.12, 1)";

// The record is one small circle that is only ever moved and scaled (transform), never re-clipped:
// those run on the compositor, so the page loading underneath cannot make them stutter.
const BASE = 320; // px; about the size of the record in the chooser's header
const RIM = 1.06; // the gold rim is a slightly larger circle behind it

type Point = { x: number; y: number };

function reach(point: Point) {
  // scale at which a BASE-wide circle centred on `point` covers the whole viewport
  const radius = Math.hypot(Math.max(point.x, innerWidth - point.x), Math.max(point.y, innerHeight - point.y));
  return (radius * 2 * RIM) / BASE + 0.1;
}

function place(el: HTMLElement, size: number, at: Point) {
  el.style.width = el.style.height = `${size}px`;
  el.style.left = `${at.x - size / 2}px`;
  el.style.top = `${at.y - size / 2}px`;
}

export function CurtainProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [covered, setCovered] = useState(false);
  const rim = useRef<HTMLDivElement>(null);
  const disc = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const grooves = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const job = useRef<{ href: string; origin: Point; covered: boolean } | null>(null);
  const guard = useRef(0);

  const finish = useCallback(() => {
    window.clearTimeout(guard.current);
    job.current = null;
    arriving = false;
    setCovered(false);
    document.documentElement.classList.remove("is-curtain");
    setActive(false);
  }, []);

  const go = useCallback<Go>(
    (href, from) => {
      if (job.current || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(href);
        return;
      }
      const box = from?.getBoundingClientRect();
      const origin = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
      job.current = { href, origin, covered: false };
      arriving = true;
      document.documentElement.classList.add("is-curtain");
      router.prefetch(href);
      setActive(true);
      // never leave a curtain over the page if something goes wrong on the way
      guard.current = window.setTimeout(finish, 9000);
    },
    [router, finish],
  );

  // 1. open: the record grows out of the button until nothing else shows
  useEffect(() => {
    const current = job.current;
    if (!active || !current || !rim.current || !disc.current) return;
    const { origin } = current;
    place(rim.current, BASE * RIM, origin);
    place(disc.current, BASE, origin);
    const full = reach(origin);
    const options: KeyframeAnimationOptions = { duration: OPEN_MS, easing: OPEN_EASE, fill: "forwards" };
    const frames = [{ transform: "scale(0.02)" }, { transform: `scale(${full})` }];
    rim.current.animate(frames, options);
    const open = disc.current.animate(frames, options);
    open.onfinish = () => {
      current.covered = true;
      router.push(current.href);
      setCovered(true);
    };
    return () => open.cancel();
  }, [active, router]);

  // 2. close: once the next page is there, the record shrinks into the one in its header.
  // (The path is read from `location`: usePathname() here would need a Suspense boundary above
  // the whole app, and the curtain has to live outside it.)
  useEffect(() => {
    const current = job.current;
    if (!active || !current?.covered) return;
    const wanted = current.href.split("?")[0];
    let frame = 0;
    let timer = 0;
    let started = 0;

    const closeNow = () => {
      if (!rim.current || !disc.current || !label.current || !grooves.current || !root.current) return finish();
      const target = document.querySelector(".catalog-record");
      const box = target?.getBoundingClientRect();
      const end = box && box.width > 0
        ? { at: { x: box.left + box.width / 2, y: box.top + box.height / 2 }, radius: box.width / 2 }
        : { at: { x: innerWidth / 2, y: innerHeight / 2 }, radius: 0 };
      const full = reach(current.origin);
      const small = Math.max(0.001, (end.radius * 2) / BASE);
      const dx = end.at.x - current.origin.x;
      const dy = end.at.y - current.origin.y;
      const options: KeyframeAnimationOptions = { duration: CLOSE_MS, easing: CLOSE_EASE, fill: "forwards" };
      const frames = [
        { transform: `translate(0px, 0px) scale(${full})` },
        { transform: `translate(${dx}px, ${dy}px) scale(${small})` },
      ];
      rim.current.animate(frames, options);
      // grooves and the gold label belong to the small record: they come in as it settles
      grooves.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], options);
      label.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], options);
      const closing = disc.current.animate(frames, options);
      closing.onfinish = () => {
        // the real record takes over: let the copy dissolve instead of cutting
        const fade = root.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: "ease-out", fill: "forwards" });
        arriving = false;
        document.documentElement.classList.remove("is-curtain");
        if (fade) fade.onfinish = finish;
        else finish();
      };
    };

    const poll = () => {
      if (location.pathname !== wanted) {
        frame = requestAnimationFrame(poll);
        return;
      }
      if (!started) started = performance.now();
      if (!document.querySelector(".catalog-record") && performance.now() - started < 1800) {
        frame = requestAnimationFrame(poll);
        return;
      }
      // The page has arrived. Let it finish hydrating before the record starts to close: the
      // animation does not depend on the main thread, but there is no reason to race it.
      timer = window.setTimeout(closeNow, 140);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [active, covered, finish]);

  useEffect(() => () => window.clearTimeout(guard.current), []);

  const overlay = useMemo(
    () => (
      <div className="curtain" ref={root} aria-hidden="true">
        <div className="curtain-rim" ref={rim} />
        <div className="curtain-disc" ref={disc}>
          <span className="curtain-grooves" ref={grooves} />
          <span className="curtain-label" ref={label} />
        </div>
      </div>
    ),
    [],
  );

  return (
    <CurtainContext.Provider value={go}>
      {children}
      {active ? createPortal(overlay, document.body) : null}
    </CurtainContext.Provider>
  );
}
