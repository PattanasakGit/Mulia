// TEST/QA-ONLY fixtures from /workspace/qa-live/mulia/test-matrix.md. Local Postgres only.
// Usage: node scripts/seed-qa.mjs   (app must have run once so tables exist, or run after start:qa + first request)
import pg from "pg";
const url = process.env.QA_DATABASE_URL ?? "postgresql://mulia@127.0.0.1:55432/mulia_qa";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("local DB only");
const db = new pg.Client(url);
await db.connect();
const X = "11111111-1111-4111-8111-111111111111"; // opener
const Y = "22222222-2222-4222-8222-222222222222"; // member
const ADMIN = "33333333-3333-4333-8333-333333333333"; // name THEPAT
const now = Date.now();
await db.query("DELETE FROM tracks; DELETE FROM playback; DELETE FROM members; DELETE FROM rooms;");
async function room(code, name, { tracks = 0, playing = false, overrun = false, opener = X } = {}) {
  const id = `fx-${code}`;
  await db.query("INSERT INTO rooms VALUES ($1,$2,$3,$4,$5)", [id, code, name, opener, now]);
  await db.query("INSERT INTO members VALUES ($1,$2,'X',150,'🦆',$3)", [X, id, now]);
  let first = null;
  for (let i = 0; i < tracks; i += 1) {
    const tid = `${id}-t${i}`;
    first ??= tid;
    await db.query("INSERT INTO tracks VALUES ($1,$2,'dQw4w9WgXcQ',$3,'Fixture',$4,$5,'X',$6,$7)", [
      tid, id, name.includes("<") ? name : `Track ${i + 1}`, `https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg`,
      overrun ? 10 : 212, now + i, i === 0 && (playing || overrun) ? "current" : "queued",
    ]);
  }
  const status = first && (playing || overrun) ? "playing" : "idle";
  await db.query("INSERT INTO playback VALUES ($1,$2,$3,0,$4)", [id, status === "idle" ? null : first, status, overrun ? now - 60_000 : now]);
}
await room("QAAAA2", "R1 empty (opener X)");
await room("QAAAA3", "R2 three tracks playing", { tracks: 3, playing: true });
await room("QAAAA4", "R3 full queue (100)", { tracks: 100 });
await room("QAAAA5", "R4 overrun track", { tracks: 2, overrun: true });
await room("QAXSS2", "<img src=x onerror=alert(1)>", { tracks: 1 });
for (let i = 0; i < 31; i += 1) await room(`QAL${String(i).padStart(3, "A").replace(/[01]/g, "Z")}`.slice(0, 6) + i, `Filler ${i}`);
await db.query("INSERT INTO members VALUES ($1,'fx-QAAAA3','Y',40,'🐼',$2), ($3,'fx-QAAAA3','THEPAT',10,'🦊',$2)", [Y, now, ADMIN]);
console.log("seeded: R1 QAAAA2, R2 QAAAA3, R3 QAAAA4, R4 QAAAA5, XSS QAXSS2, +31 fillers; ids X/Y/THEPAT", { X, Y, ADMIN });
await db.end();
