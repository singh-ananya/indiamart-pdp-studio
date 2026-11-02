import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// .env is committed so Lovable builds get the Supabase settings. It must only ever hold
// the two public values; a secret here would be pushed to GitHub and shipped to browsers.
const ENV_FILE = path.resolve(__dirname, "../../.env");
const ALLOWED_KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

const entries = () =>
  readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const eq = line.indexOf("=");
      return { key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() };
    });

describe("committed .env", () => {
  it("exists", () => {
    expect(existsSync(ENV_FILE)).toBe(true);
  });

  it("holds only the public Supabase URL and publishable key", () => {
    expect(entries().map((e) => e.key)).toEqual(ALLOWED_KEYS);
    const values = Object.fromEntries(entries().map((e) => [e.key, e.value]));
    expect(values["VITE_SUPABASE_URL"]).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(values["VITE_SUPABASE_PUBLISHABLE_KEY"]).toMatch(/^sb_publishable_/);
  });

  it("contains no secret or service-role key anywhere, even in comments' values", () => {
    const text = readFileSync(ENV_FILE, "utf8");
    expect(text).not.toMatch(/sb_secret_[A-Za-z0-9]/);
    expect(text).not.toMatch(/^\s*[A-Z_]*(SECRET|SERVICE_ROLE)[A-Z_]*\s*=/m);
    // Legacy service_role JWTs start with "eyJ".
    expect(text).not.toMatch(/=\s*eyJ/);
  });
});
