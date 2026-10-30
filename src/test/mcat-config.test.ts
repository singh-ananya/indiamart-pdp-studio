import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getMcatImageContext,
  getMcatRanking,
  parseMcatConfigText,
  placeMcatDimensions,
  sha256Hex,
  type McatConfig,
} from "@/lib/pdp/mcat-config";
import { isAllowedEmail, versionObjectPath } from "@/lib/pdp/mcat-config-store";

const rankingFor = (image: string, company: string) => [
  { Dimension: "image", Level: image, Rank: "1", Show: "Yes" },
  { Dimension: "specification", Level: "High", Rank: "2", Show: "Yes" },
  { Dimension: "price", Level: "Medium", Rank: "3", Show: "Yes" },
  { Dimension: "company", Level: company, Rank: "4", Show: "Yes" },
  { Dimension: "unit", Level: "Low", Rank: "5", Show: "No" },
];

const fileText = (mcats: Record<string, unknown>, version: unknown = "2026-10-01") =>
  JSON.stringify({ version, mcats });

function parseOk(text: string): McatConfig {
  const result = parseMcatConfigText(text);
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.config;
}

describe("MCAT configuration parsing", () => {
  it("accepts the mcatcontext.json shape and reports version and count", () => {
    const config = parseOk(
      fileText({
        "1": { importance_ranking: rankingFor("High", "Medium") },
        "2": { importance_ranking: rankingFor("Low", "High") },
      }),
    );
    expect(config.version).toBe("2026-10-01");
    expect(config.mcatCount).toBe(2);
    expect(config.warnings).toEqual([]);
  });

  it("keeps misspelt values as written and reports them instead of correcting them", () => {
    const ranking = rankingFor("Medum", "High");
    ranking[1] = { Dimension: "specifiction", Level: "High", Rank: "2", Show: "n/a" };
    const config = parseOk(fileText({ "7": { importance_ranking: ranking } }));
    expect(config.warnings.join("\n")).toMatch(/"specifiction" ×1/);
    expect(config.warnings.join("\n")).toMatch(/"Medum" ×1/);
    expect(config.warnings.join("\n")).toMatch(/"n\/a" ×1/);

    const entries = getMcatRanking(config, "7")!;
    expect(entries[0]).toMatchObject({ dimension: "image", level: null, raw: { level: "Medum" } });
    expect(entries[1]).toMatchObject({
      dimension: null,
      show: null,
      raw: { dimension: "specifiction" },
    });
  });

  it.each([
    ["empty text", ""],
    ["not JSON", "{oops"],
    ["an array", "[]"],
    ["no mcats object", JSON.stringify({ version: "x" })],
    ["empty mcats", fileText({})],
    ["a record without importance_ranking", fileText({ "1": { ranking: [] } })],
    ["an empty ranking", fileText({ "1": { importance_ranking: [] } })],
    [
      "a non-string Level",
      fileText({
        "1": { importance_ranking: [{ Dimension: "image", Level: 3, Rank: "1", Show: "Yes" }] },
      }),
    ],
    [
      "a missing Show",
      fileText({ "1": { importance_ranking: [{ Dimension: "image", Level: "High", Rank: "1" }] } }),
    ],
    [
      "an object version",
      fileText({ "1": { importance_ranking: rankingFor("High", "High") } }, { v: 1 }),
    ],
  ])("rejects %s with a readable error", (_label, text) => {
    const result = parseMcatConfigText(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("names the failing record and caps the error list", () => {
    const mcats = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), {}]));
    const result = parseMcatConfigText(fileText(mcats));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toBe('mcats.1: needs an "importance_ranking" array');
    expect(result.errors).toHaveLength(11);
    expect(result.errors[10]).toBe("…and 5 more problem(s)");
  });
});

describe("MCAT lookup", () => {
  const config = parseOk(fileText({ "42": { importance_ranking: rankingFor("High", "Low") } }));

  it("returns the ranking in file order with raw values kept", () => {
    const entries = getMcatRanking(config, " 42 ")!;
    expect(entries.map((e) => e.dimension)).toEqual([
      "image",
      "specification",
      "price",
      "company",
      "unit",
    ]);
    expect(entries[4]).toMatchObject({ level: "low", rank: 5, show: false, raw: { show: "No" } });
  });

  it("returns null for IDs that are not in the file, including inherited property names", () => {
    expect(getMcatRanking(config, "43")).toBeNull();
    expect(getMcatRanking(config, "")).toBeNull();
    expect(getMcatRanking(config, "toString")).toBeNull();
    expect(getMcatRanking(config, "__proto__")).toBeNull();
  });
});

describe("im-lite image context", () => {
  const contextFor = (image: string, company: string) =>
    getMcatImageContext(
      getMcatRanking(
        parseOk(fileText({ "1": { importance_ranking: rankingFor(image, company) } })),
        "1",
      )!,
    );

  it("matches im-lite's low-image rule", () => {
    expect(contextFor("Low", "High")).toBe("LOW_IMG_COMPANY_HIGH");
    expect(contextFor("Low", "Medium")).toBe("LOW_IMG");
    expect(contextFor(" low ", "HIGH")).toBe("LOW_IMG_COMPANY_HIGH");
    expect(contextFor("High", "High")).toBe("");
  });

  it("does not treat a misspelt level as low, exactly like im-lite", () => {
    expect(contextFor("Lw", "High")).toBe("");
  });

  it("lets a later entry for the same dimension win, exactly like im-lite", () => {
    const ranking = [
      ...rankingFor("High", "Medium"),
      { Dimension: "image", Level: "Low", Rank: "6", Show: "Yes" },
    ];
    const config = parseOk(fileText({ "1": { importance_ranking: ranking } }));
    expect(getMcatImageContext(getMcatRanking(config, "1")!)).toBe("LOW_IMG");
  });
});

describe("dimension placement per concept", () => {
  const ranking = getMcatRanking(
    parseOk(fileText({ "1": { importance_ranking: rankingFor("High", "High") } })),
    "1",
  )!;

  it("reports each dimension as above the fold, below it, or missing from the layout", () => {
    const placements = placeMcatDimensions(
      ranking,
      ["gallery", "title", "price", "cta", "specs", "seller"],
      ["gallery", "title", "price"],
    );
    expect(placements.map((p) => [p.entry.dimension, p.status])).toEqual([
      ["image", "above"],
      ["specification", "not-above"],
      ["price", "above"],
      ["company", "not-above"],
      ["unit", "above"],
    ]);
  });

  it("counts company as placed when either the seller card or trust signals are above the fold", () => {
    const placements = placeMcatDimensions(ranking, ["trust", "title"], ["trust"]);
    expect(placements.find((p) => p.entry.dimension === "company")?.status).toBe("above");
    expect(placements.find((p) => p.entry.dimension === "image")?.status).toBe("not-in-layout");
  });

  it("skips entries whose dimension is not recognised", () => {
    const config = parseOk(
      fileText({
        "1": {
          importance_ranking: [{ Dimension: "brand", Level: "High", Rank: "1", Show: "Yes" }],
        },
      }),
    );
    expect(placeMcatDimensions(getMcatRanking(config, "1")!, ["gallery"], ["gallery"])).toEqual([]);
  });
});

describe("storage helpers", () => {
  it("accepts only @indiamart.com addresses", () => {
    expect(isAllowedEmail("a.b@indiamart.com")).toBe(true);
    expect(isAllowedEmail(" A.B@IndiaMART.com ")).toBe(true);
    expect(isAllowedEmail("a@indiamart.com.evil.com")).toBe(false);
    expect(isAllowedEmail("a@notindiamart.com")).toBe(false);
    expect(isAllowedEmail("indiamart.com")).toBe(false);
  });

  it("hashes the exact bytes with SHA-256 and derives a content-addressed path", async () => {
    const sha = await sha256Hex(new TextEncoder().encode("abc"));
    expect(sha).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(versionObjectPath(sha)).toBe(`versions/${sha}.json`);
  });
});

// Reads the real master file in place (never modified). Skipped where it is not present.
const MASTER_FILE =
  "C:\\Users\\Imart\\mobile-im-pw\\im-lite\\server\\McatContextJSON\\mcatcontext.json";

describe("real im-lite master file", () => {
  it.skipIf(!existsSync(MASTER_FILE))(
    "validates and resolves MCATs the same way im-lite does",
    () => {
      const text = readFileSync(MASTER_FILE, "utf8");
      const config = parseOk(text);
      const raw = JSON.parse(text) as {
        mcats: Record<string, { importance_ranking: { Dimension: string; Level: string }[] }>;
      };
      expect(config.mcatCount).toBe(Object.keys(raw.mcats).length);
      expect(getMcatRanking(config, "1")).not.toBeNull();

      // Independent re-implementation of im-lite's buildLowImageIndex() for comparison.
      const level = (e: { Level: string }) => String(e.Level).trim().toLowerCase();
      let compared = 0;
      for (const [id, record] of Object.entries(raw.mcats)) {
        let image = "";
        let company = "";
        for (const e of record.importance_ranking) {
          const d = String(e.Dimension).trim().toLowerCase();
          if (d === "image") image = level(e);
          else if (d === "company") company = level(e);
        }
        const expected =
          image === "low" ? (company === "high" ? "LOW_IMG_COMPANY_HIGH" : "LOW_IMG") : "";
        expect(getMcatImageContext(getMcatRanking(config, id)!)).toBe(expected);
        compared++;
      }
      expect(compared).toBe(config.mcatCount);
    },
    60_000,
  );
});
