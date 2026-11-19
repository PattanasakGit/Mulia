import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "@/lib/db";
import { ArchiveError } from "@/lib/rooms";
import { FEEDBACK_BODY_MAX, FEEDBACK_LIST_MAX, FEEDBACK_TOPIC_MAX } from "@/lib/limits";

export type FeedbackItem = { id: string; topic: string; body: string; createdAt: number };

/** Global brake on top of the per-client buckets: a rotating-address script cannot fill the table. */
const HOURLY_CAP = 300;

// Control characters except tab/newline; they have no place in a report and can break lists.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function clean(value: unknown, label: string, max: number, multiline: boolean) {
  if (typeof value !== "string") throw new ArchiveError(`ต้องระบุ${label}`, 400);
  const text = multiline
    ? value.replace(CONTROL, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : value.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (text.length < 1 || [...text].length > max) {
    throw new ArchiveError(`${label}ต้องยาว 1–${max} ตัวอักษร`, 400);
  }
  return text;
}

export async function submitFeedback(input: { topic: unknown; body: unknown }): Promise<FeedbackItem> {
  const topic = clean(input.topic, "หัวข้อ", FEEDBACK_TOPIC_MAX, false);
  const body = clean(input.body, "รายละเอียด", FEEDBACK_BODY_MAX, true);
  const now = Date.now();
  const recent = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM feedback WHERE created_at > ?", [now - 3_600_000]);
  if ((recent?.n ?? 0) >= HOURLY_CAP) throw new ArchiveError("ตอนนี้มีรายการเข้ามาเยอะ รอสักครู่แล้วลองใหม่", 429);
  const id = randomUUID();
  await execute("INSERT INTO feedback (id, topic, body, created_at) VALUES (?, ?, ?, ?)", [id, topic, body, now]);
  return { id, topic, body, createdAt: now };
}

export async function listFeedback(): Promise<FeedbackItem[]> {
  const rows = await query<{ id: string; topic: string; body: string; created_at: number }>(
    "SELECT id, topic, body, created_at FROM feedback ORDER BY created_at DESC, id DESC LIMIT ?",
    [FEEDBACK_LIST_MAX],
  );
  return rows.map((row) => ({ id: row.id, topic: row.topic, body: row.body, createdAt: row.created_at }));
}
