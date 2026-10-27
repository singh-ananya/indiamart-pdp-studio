import { z } from "zod";
import type { PdpContext, Product } from "./types";

/**
 * Validation for user-supplied PDP inputs.
 *
 * Every IndiaMART-specific field is optional. When a field is missing, the
 * previews show an explicit "not provided" slot — they never fill in a value.
 */

const httpUrl = z
  .string()
  .trim()
  .url("must be a valid URL")
  .refine((u) => /^https?:\/\//i.test(u), "must start with http:// or https://");

const currentYear = () => new Date().getFullYear();

export const PdpContextSchema = z
  .object({
    brand: z.string(),
    category: z.string(),
    city: z.string(),
    offer: z.string(),
    usps: z.array(z.string()),
    /** MCAT-level ISQ attribute names, in display priority order. */
    isqAttributes: z.array(z.string().trim().min(1, "attribute names cannot be empty")),
    /** Seller rating out of 5. */
    sellerRating: z.number().min(0, "must be 0 or more").max(5, "must be 5 or less"),
    ratingCount: z.number().int("must be a whole number").nonnegative(),
    /** Year the seller joined, e.g. 2017 or "2017". */
    memberSince: z
      .union([
        z.number().int(),
        z
          .string()
          .trim()
          .regex(/^\d{4}$/, "must be a 4-digit year"),
      ])
      .transform(String)
      .refine((y) => Number(y) >= 1990 && Number(y) <= currentYear(), {
        message: "must be a year between 1990 and the current year",
      }),
    gstVerified: z.boolean(),
    verifiedSupplier: z.boolean(),
    /** Enquiry response rate as a percentage, 0–100. */
    responseRate: z.number().min(0, "must be 0 or more").max(100, "must be 100 or less"),
  })
  .partial();

export const CONTEXT_KEYS = Object.keys(PdpContextSchema.shape) as (keyof PdpContext)[];

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
  );
}

const EMPTY_CONTEXT_FIELDS = {
  brand: "",
  category: "",
  city: "",
  offer: "",
  usps: [] as string[],
  isqAttributes: [] as string[],
};

/** Validate an already-parsed JSON value as PDP context. */
export function validatePdpContext(raw: unknown): PdpContext {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: "Context must be a JSON object",
      issues: ["Context must be a JSON object"],
      ignoredKeys: [],
      ...EMPTY_CONTEXT_FIELDS,
    };
  }
  const ignoredKeys = Object.keys(raw).filter(
    (key) => !CONTEXT_KEYS.includes(key as keyof PdpContext),
  );
  const result = PdpContextSchema.safeParse(raw);
  if (!result.success) {
    const issues = formatIssues(result.error);
    return {
      ok: false,
      error: issues[0],
      issues,
      ignoredKeys,
      ...EMPTY_CONTEXT_FIELDS,
    };
  }
  const data = result.data;
  return {
    ok: true,
    issues: [],
    ignoredKeys,
    brand: data.brand ?? "",
    category: data.category ?? "",
    city: data.city ?? "",
    offer: data.offer ?? "",
    usps: (data.usps ?? []).map((u) => u.trim()).filter(Boolean),
    isqAttributes: data.isqAttributes ?? [],
    sellerRating: data.sellerRating,
    ratingCount: data.ratingCount,
    memberSince: data.memberSince,
    gstVerified: data.gstVerified,
    verifiedSupplier: data.verifiedSupplier,
    responseRate: data.responseRate,
  };
}

/** Parse the JSON context editor text. Never throws. */
export function parsePdpContext(raw: string): PdpContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return {
      ok: false,
      error: message,
      issues: [message],
      ignoredKeys: [],
      ...EMPTY_CONTEXT_FIELDS,
    };
  }
  return validatePdpContext(parsed);
}

const textish = z.union([z.string(), z.number().transform(String)]);

/**
 * Product as accepted from an imported file. Extra keys are ignored; ids are
 * reassigned on import so they are always unique.
 */
export const ProductInputSchema = z.object({
  name: z.string().default(""),
  price: textish.default(""),
  /** Upper end of a price range; leave empty for a single price. */
  priceMax: textish.default(""),
  /** Selling unit, e.g. "piece", "kg", "box". */
  unit: z.string().default(""),
  moq: textish.default(""),
  highlights: z
    .union([z.string(), z.array(z.string()).transform((items) => items.join(", "))])
    .default(""),
  /** ISQ / spec values as "Name: Value" lines. */
  specs: z.string().default(""),
  /** Alternative structured ISQ values; merged into specs on import. */
  isq: z.array(z.object({ name: z.string().trim().min(1), value: textish })).optional(),
  description: z.string().default(""),
  imageUrls: z.array(httpUrl).max(10, "at most 10 image URLs per product").default([]),
});

export type ProductInput = z.input<typeof ProductInputSchema>;

export function toProduct(input: z.output<typeof ProductInputSchema>, index: number): Product {
  const isqLines = (input.isq ?? []).map((row) => `${row.name}: ${row.value}`);
  const specs = [input.specs.trim(), ...isqLines].filter(Boolean).join("\n");
  return {
    id: `p${index + 1}`,
    name: input.name,
    price: input.price,
    priceMax: input.priceMax,
    unit: input.unit,
    moq: input.moq,
    highlights: input.highlights,
    specs,
    description: input.description,
    imageUrls: input.imageUrls,
  };
}

/** Split the image URL editor text into URLs and report the invalid lines. */
export function parseImageUrlText(text: string): { urls: string[]; invalid: string[] } {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const line of text.split("\n")) {
    const value = line.trim();
    if (!value) continue;
    if (httpUrl.safeParse(value).success) urls.push(value);
    else invalid.push(value);
  }
  return { urls, invalid };
}

export { formatIssues };
