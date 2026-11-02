import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import {
  mapIndiaMartProduct,
  mapSearchResults,
  matchScore,
  parseIndiaMartId,
  rankMatches,
  toPlainText,
  type IndiaMartResult,
  type SearchResult,
} from "@/lib/indiamart/product";
import { DEFAULT_CONTEXT_JSON, DEFAULT_MCAT, DEMO_PRODUCTS } from "@/lib/pdp/demo-data";
import {
  createDefaultState,
  serializeState,
  STORAGE_KEY,
  stripDemoData,
} from "@/lib/pdp/studio-state";

/** Trimmed from a real m.indiamart.com/ajaxrequest/proddetail.php response (public data). */
const REAL_RESPONSE = [
  {
    PC_ITEM_NAME: "32 Inch LED TV",
    PC_ITEM_DISPLAY_NAME: "",
    FOB_PRICE: "7800",
    PC_ITEM_FOB_PRICE_ABSURD_FLAG: "0",
    PRODUCT_PRICE: "₹ 7,800 / Piece",
    PC_ITEM_MOQ_UNIT_TYPE: "Piece",
    ETO_OFR_QTY: "5 Piece",
    BRD_MCAT_ID: "650708",
    BRD_MCAT_NAME: "32 inch LED TV",
    COMPANYNAME: "V & M Industries",
    CITY: "Noida",
    SELLER_RATING: "3.6",
    SELLER_RATING_COUNTS: { avg_rating: 3.6, total_count: 28 },
    GST_VERIFIED: "1",
    GLUSR_USR_MEMBERSINCE: "2020-05-21 22:38:15",
    PC_ITEM_DESC_SMALL:
      "Experience stunning visuals with the VM BEST 80 cm (32 inch) HD Smart LED TV.<br>Built-in Google Assistant &amp; apps.",
    PC_IMG_SMALL_600X600:
      "https://5.imimg.com/data5/SELLER/Default/2024/11/468823536/CB/ZX/SV/105831662/32-inch-led-tv-500x500.jpeg",
    ITEM_IMG: [
      {
        IMAGE_500X500:
          "https://5.imimg.com/data5/SELLER/Default/2024/11/468823536/CB/ZX/SV/105831662/32-inch-led-tv-500x500.jpeg",
        IMAGE_ORIGINAL: "https://5.imimg.com/x/original.jpeg",
      },
      { IMAGE_500X500: "", IMAGE_ORIGINAL: "https://5.imimg.com/x/second-original.jpeg" },
      { IMAGE_500X500: "http://insecure.example/x.jpg" },
    ],
    ISQ: [
      {
        FK_IM_SPEC_MASTER_DESC: "Mounting Type",
        SUPPLIER_RESPONSE_DETAIL: "Wall Mount",
        SUPPLIER_RESPONSE_DETAIL_UOM: "",
        IM_CAT_SPEC_PRIORITY: "2",
      },
      {
        FK_IM_SPEC_MASTER_DESC: "Screen Size",
        SUPPLIER_RESPONSE_DETAIL: "32 inch",
        SUPPLIER_RESPONSE_DETAIL_UOM: "",
        IM_CAT_SPEC_PRIORITY: "1",
      },
      {
        FK_IM_SPEC_MASTER_DESC: "Weight",
        SUPPLIER_RESPONSE_DETAIL: "4",
        SUPPLIER_RESPONSE_DETAIL_UOM: "kg",
        IM_CAT_SPEC_PRIORITY: "3",
      },
      { FK_IM_SPEC_MASTER_DESC: "Colour", SUPPLIER_RESPONSE_DETAIL: "", IM_CAT_SPEC_PRIORITY: "4" },
    ],
  },
];

describe("IndiaMART product data", () => {
  it("reads display IDs from IDs and IndiaMART URLs only", () => {
    expect(parseIndiaMartId("2851707213873")).toBe("2851707213873");
    expect(
      parseIndiaMartId("https://m.indiamart.com/proddetail/32-inch-led-tv-2851707213873.html"),
    ).toBe("2851707213873");
    expect(parseIndiaMartId("https://www.indiamart.com/proddetail/x-19446328288.html?pos=1")).toBe(
      "19446328288",
    );
    expect(
      parseIndiaMartId("https://m.indiamart.com/ajaxrequest/proddetail.php?displayId=12345678"),
    ).toBe("12345678");
    expect(parseIndiaMartId("https://example.com/proddetail/x-2851707213873.html")).toBeNull();
    expect(parseIndiaMartId("32 inch tv")).toBeNull();
    expect(parseIndiaMartId("123")).toBeNull();
  });

  it("maps real price, images, ISQ, MOQ, description and seller", () => {
    const result = mapIndiaMartProduct(REAL_RESPONSE, "2851707213873");
    if (!result.ok) throw new Error(result.error);
    const { product, seller } = result.data;
    expect(product).toMatchObject({
      name: "32 Inch LED TV",
      price: "7800",
      unit: "Piece",
      moq: "5 Piece",
      highlights: "",
    });
    expect(product.specs).toBe("Screen Size: 32 inch\nMounting Type: Wall Mount\nWeight: 4 kg");
    expect(product.imageUrls).toEqual([
      "https://5.imimg.com/data5/SELLER/Default/2024/11/468823536/CB/ZX/SV/105831662/32-inch-led-tv-500x500.jpeg",
      "https://5.imimg.com/x/second-original.jpeg",
    ]);
    expect(product.description).toBe(
      "Experience stunning visuals with the VM BEST 80 cm (32 inch) HD Smart LED TV.\nBuilt-in Google Assistant & apps.",
    );
    expect(seller).toEqual({
      name: "V & M Industries",
      city: "Noida",
      rating: 3.6,
      ratingCount: 28,
      gstVerified: true,
      memberSince: "2020",
    });
    expect(result.data.mcatId).toBe("650708");
  });

  it("leaves the price empty when IndiaMART flags it as implausible or missing", () => {
    const flagged = mapIndiaMartProduct(
      [{ ...REAL_RESPONSE[0], PC_ITEM_FOB_PRICE_ABSURD_FLAG: "1" }],
      "1",
    );
    const missing = mapIndiaMartProduct([{ ...REAL_RESPONSE[0], FOB_PRICE: "" }], "1");
    expect(flagged.ok && flagged.data.product.price).toBe("");
    expect(missing.ok && missing.data.product.price).toBe("");
  });

  it("reports missing products instead of inventing one", () => {
    expect(mapIndiaMartProduct([], "1")).toEqual({
      ok: false,
      error: "IndiaMART returned no product data for this ID.",
    });
    expect(mapIndiaMartProduct({ status: "404" }, "1").ok).toBe(false);
    expect(toPlainText("<p>A&nbsp;b</p>")).toBe("A b");
  });
});

/** Shaped like real m.indiamart.com/ajaxrequest/search/search results (public data). */
const SEARCH_BODY = {
  results: [
    {
      displayid: "22154018648",
      title: "32 Inch Sony Bravia LED TV",
      price_f: "16000",
      companyname: "G.K Electronics",
      city: "Delhi",
      mcatid: ["184301"],
      image: "https://5.imimg.com/a-125x125.jpg",
    },
    {
      displayid: "2856854717230",
      title: "Sony BRAVIA 80 cm (32 inches) HD Ready Smart LED Google TV KD-32W835 (Black)",
      price_f: "29990",
      companyname: "Satnam Electronics",
      city: "Mumbai",
      mcatid: ["184301"],
      image: "https://5.imimg.com/b-125x125.jpg",
    },
    { displayid: "not-an-id", title: "Broken row" },
    {
      fields: {
        displayid: "2851707213873",
        title: "32 Inch LED TV",
        price_f: "7800",
        companyname: "V & M Industries",
        mcatid: "650708",
      },
    },
  ],
};

describe("IndiaMART search matching", () => {
  it("maps search results and skips rows without a valid listing ID", () => {
    const matches = mapSearchResults(SEARCH_BODY);
    expect(matches.map((m) => m.displayId)).toEqual([
      "22154018648",
      "2856854717230",
      "2851707213873",
    ]);
    expect(matches[1]).toMatchObject({
      company: "Satnam Electronics",
      price: "29990",
      mcatIds: ["184301"],
    });
    expect(mapSearchResults({ results: "redirect" })).toEqual([]);
  });

  it("ranks listings by how many words of the name they contain", () => {
    const matches = mapSearchResults(SEARCH_BODY);
    const ranked = rankMatches("Sony Bravia KD-32W835 32 inch", matches, "");
    expect(ranked[0]!.displayId).toBe("2856854717230");
    expect(matchScore("Sony Bravia KD-32W835 32 inch", ranked[0]!, "")).toBeGreaterThanOrEqual(0.6);
    // 32" and "32 inches" read as the same word.
    expect(matchScore('Sony 32"', matches[1]!, "")).toBe(1);
  });
});

describe("Find products on IndiaMART by name", () => {
  beforeEach(() => window.localStorage.clear());

  function fakes(options: { search?: SearchResult } = {}) {
    const searched: string[] = [];
    const fetched: string[] = [];
    const search = async (query: string): Promise<SearchResult> => {
      searched.push(query);
      return options.search ?? { ok: true, matches: mapSearchResults(SEARCH_BODY) };
    };
    const fetchProduct = async (id: string): Promise<IndiaMartResult> => {
      fetched.push(id);
      const base = mapIndiaMartProduct(REAL_RESPONSE, id);
      if (!base.ok) return base;
      const title = mapSearchResults(SEARCH_BODY).find((m) => m.displayId === id)?.title;
      return {
        ok: true,
        data: {
          ...base.data,
          product: { ...base.data.product, name: title ?? base.data.product.name },
        },
      };
    };
    return { search, fetchProduct, searched, fetched };
  }

  it("finds the best-matching listing from the name alone and fills real data", async () => {
    const f = fakes();
    render(<PdpStudio productSearch={f.search} productFetch={f.fetchProduct} />);
    const row = screen.getByLabelText("Brief product 1");
    fireEvent.change(within(row).getByLabelText("Brief product 1 name"), {
      target: { value: "Sony Bravia KD-32W835 32 inch" },
    });
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Find on IndiaMART" }));
    });

    expect(f.searched).toEqual(["Sony Bravia KD-32W835 32 inch"]);
    expect(f.fetched).toEqual(["2856854717230"]);
    expect(within(row).getByLabelText("Product 1 IndiaMART listing")).toHaveValue("2856854717230");
    expect(within(row).getByRole("status")).toHaveTextContent(
      "Filled from IndiaMART: price, 2 image(s), 3 ISQ value(s), MOQ, description.",
    );
    expect(within(row).getByRole("status")).not.toHaveTextContent("Closest listing found");
    expect(screen.getByLabelText("Product 1 price")).toHaveValue("7800");
    expect(screen.getByLabelText("Product 1 specs")).toHaveValue(
      "Screen Size: 32 inch\nMounting Type: Wall Mount\nWeight: 4 kg",
    );
    expect(within(row).getByLabelText("Brief product 1 name")).toHaveValue(
      "Sony BRAVIA 80 cm (32 inches) HD Ready Smart LED Google TV KD-32W835 (Black)",
    );
  });

  it("lets the user switch to another listing", async () => {
    const f = fakes();
    render(<PdpStudio productSearch={f.search} productFetch={f.fetchProduct} />);
    const row = screen.getByLabelText("Brief product 1");
    fireEvent.change(within(row).getByLabelText("Brief product 1 name"), {
      target: { value: "Sony Bravia 32 inch" },
    });
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Find on IndiaMART" }));
    });
    await act(async () => {
      fireEvent.change(within(row).getByLabelText("Product 1 IndiaMART listing"), {
        target: { value: "22154018648" },
      });
    });
    expect(f.fetched.at(-1)).toBe("22154018648");
    expect(within(row).getByLabelText("Brief product 1 name")).toHaveValue(
      "32 Inch Sony Bravia LED TV",
    );
  });

  it("Find all searches every named product", async () => {
    const f = fakes();
    render(<PdpStudio productSearch={f.search} productFetch={f.fetchProduct} />);
    fireEvent.change(screen.getByLabelText("Brief product 1 name"), {
      target: { value: "Sony Bravia 32 inch" },
    });
    fireEvent.change(screen.getByLabelText("Brief product 3 name"), {
      target: { value: "32 Inch LED TV" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Find all on IndiaMART" }));
    });
    expect(f.searched).toEqual(["Sony Bravia 32 inch", "32 Inch LED TV"]);
    expect(f.fetched).toHaveLength(2);
  });

  it("warns when only a loose match exists, and reports no results without changing anything", async () => {
    const f = fakes();
    render(<PdpStudio productSearch={f.search} productFetch={f.fetchProduct} />);
    const row = screen.getByLabelText("Brief product 1");
    fireEvent.change(within(row).getByLabelText("Brief product 1 name"), {
      target: { value: "Samsung Crystal 4K television" },
    });
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Find on IndiaMART" }));
    });
    expect(within(row).getByRole("status")).toHaveTextContent(
      "Closest listing found, but its title differs from your name",
    );

    const empty = fakes({ search: { ok: true, matches: [] } });
    render(<PdpStudio productSearch={empty.search} productFetch={empty.fetchProduct} />);
    const row2 = screen.getAllByLabelText("Brief product 2").at(-1)!;
    fireEvent.change(within(row2).getByLabelText("Brief product 2 name"), {
      target: { value: "Nonexistent gadget" },
    });
    await act(async () => {
      fireEvent.click(within(row2).getByRole("button", { name: "Find on IndiaMART" }));
    });
    expect(within(row2).getByRole("alert")).toHaveTextContent(
      'No IndiaMART listings found for "Nonexistent gadget"',
    );
    // Retried once as a supplier search before giving up.
    expect(empty.searched).toEqual(["Nonexistent gadget", "Nonexistent gadget supplier"]);
    expect(empty.fetched).toEqual([]);
    expect(within(row2).getByLabelText("Brief product 2 name")).toHaveValue("Nonexistent gadget");
  });

  it("can still use a specific listing link, and adds the seller to the context", async () => {
    const f = fakes();
    render(<PdpStudio productSearch={f.search} productFetch={f.fetchProduct} />);
    fireEvent.change(screen.getByLabelText("MCAT ID"), { target: { value: "999" } });
    const row = screen.getByLabelText("Brief product 1");
    fireEvent.change(within(row).getByLabelText("Product 1 IndiaMART URL or ID"), {
      target: { value: "https://m.indiamart.com/proddetail/32-inch-led-tv-2851707213873.html" },
    });
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Use this listing" }));
    });
    expect(f.searched).toEqual([]);
    expect(f.fetched).toEqual(["2851707213873"]);
    expect(within(row).getByRole("status")).toHaveTextContent(
      "This listing is in MCAT 650708 (32 inch LED TV), not 999.",
    );
    expect(within(row).getByRole("status")).toHaveTextContent(
      "Seller: V & M Industries · Noida · rating 3.6 (28) · GST verified · on IndiaMART since 2020",
    );

    fireEvent.click(within(row).getByRole("button", { name: "Use as seller details" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON Context" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      JSON.parse((screen.getByLabelText("JSON context editor") as HTMLTextAreaElement).value),
    ).toEqual({
      brand: "V & M Industries",
      city: "Noida",
      sellerRating: 3.6,
      ratingCount: 28,
      gstVerified: true,
      memberSince: "2020",
    });
  });

  it("rejects links that are not IndiaMART listings", async () => {
    const f = fakes();
    render(<PdpStudio productSearch={f.search} productFetch={f.fetchProduct} />);
    const row = screen.getByLabelText("Brief product 1");
    fireEvent.change(within(row).getByLabelText("Product 1 IndiaMART URL or ID"), {
      target: { value: "https://example.com/tv-123456789.html" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Use this listing" }));
    expect(within(row).getByRole("alert")).toHaveTextContent("Paste an IndiaMART product URL");
    expect(f.fetched).toEqual([]);
  });
});

describe("demo data is gone", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts with an empty brief", () => {
    const state = createDefaultState();
    expect(state.mcat).toBe("");
    expect(state.contextJson).toBe("{}");
    expect(state.products.every((p) => p.name === "" && p.specs === "")).toBe(true);
    render(<PdpStudio />);
    expect(screen.queryByText(/\(demo\)/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("MCAT name")).toHaveValue("");
  });

  it("removes untouched demo values from older saves but keeps what the user changed", () => {
    const old = {
      ...createDefaultState(),
      mcat: DEFAULT_MCAT,
      contextJson: DEFAULT_CONTEXT_JSON,
      products: DEMO_PRODUCTS.map((p, i) =>
        i === 0 ? { ...p, name: "32 Inch Smart Led Tv" } : { ...p },
      ),
    };
    const cleaned = stripDemoData(old);
    expect(cleaned.mcat).toBe("");
    expect(cleaned.contextJson).toBe("{}");
    expect(cleaned.products[0]).toMatchObject({
      name: "32 Inch Smart Led Tv",
      specs: "",
      highlights: "",
      description: "",
      price: "",
    });
    expect(cleaned.products[1]!.name).toBe("");
  });

  it("cleans a saved brief when the app loads", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      serializeState({
        ...createDefaultState(),
        mcat: DEFAULT_MCAT,
        contextJson: DEFAULT_CONTEXT_JSON,
        products: DEMO_PRODUCTS.map((p) => ({ ...p })),
      }),
    );
    render(<PdpStudio />);
    await screen.findByText("Saved in this browser");
    expect(screen.getByLabelText("MCAT name")).toHaveValue("");
    expect(screen.queryByText(/\(demo\)/)).not.toBeInTheDocument();
  });
});
