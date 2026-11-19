import { describe, expect, it } from "vitest";
import { createLocalPool, resolvePgTarget } from "@/lib/db-local";

describe("resolvePgTarget", () => {
  it("accepts loopback hosts without TLS", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(resolvePgTarget(`postgresql://u:p@${host}:5432/db`, {})).toEqual({
        connectionString: `postgresql://u:p@${host}:5432/db`,
        ssl: false,
      });
    }
  });

  it("accepts a private container host named in DB_PG_ALLOWED_HOSTS", () => {
    const env = { DB_PG_ALLOWED_HOSTS: " db , other " };
    expect(resolvePgTarget("postgresql://u:p@db:5432/mulia", env).ssl).toBe(false);
    expect(() => resolvePgTarget("postgresql://u:p@evil:5432/mulia", env)).toThrow(/test-only/);
  });

  it("refuses a remote host unless explicitly allowed", () => {
    expect(() => resolvePgTarget("postgresql://u:p@ep-x.neon.tech/db", {})).toThrow(/test-only/);
  });

  it("requires strict TLS for an allowed remote host and drops a loose sslmode", () => {
    const target = resolvePgTarget("postgresql://u:p@db.example.com/db?sslmode=require&application_name=mulia", {
      DB_PG_ALLOW_REMOTE: "1",
      DB_PG_CA: "  PEM  ",
    });
    expect(target.ssl).toEqual({ rejectUnauthorized: true, ca: "PEM" });
    expect(target.connectionString).not.toContain("sslmode");
    expect(target.connectionString).toContain("application_name=mulia");
  });

  it("rejects sslmode=disable for a remote host", () => {
    expect(() =>
      resolvePgTarget("postgresql://u:p@db.example.com/db?sslmode=disable", { DB_PG_ALLOW_REMOTE: "1" }),
    ).toThrow(/TLS/);
  });

  it("bounds the pool size from the environment", () => {
    const pool = createLocalPool("postgresql://u:p@127.0.0.1:1/db", { DB_POOL_MAX: "9999" });
    expect((pool as unknown as { options: { max: number } }).options.max).toBe(10);
    void pool.end();
    const small = createLocalPool("postgresql://u:p@127.0.0.1:1/db", { DB_POOL_MAX: "3" });
    expect((small as unknown as { options: { max: number } }).options.max).toBe(3);
    void small.end();
  });
});
