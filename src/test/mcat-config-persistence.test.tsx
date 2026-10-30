import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { CONCEPTS } from "@/lib/pdp/concepts";
import { sha256Hex } from "@/lib/pdp/mcat-config";
import {
  createMemoryCache,
  createMemoryRemote,
  type CachedMcatConfig,
  type McatConfigVersion,
} from "@/lib/pdp/mcat-config-store";

const USER = "saltorokangri.dev@indiamart.com";

const rankingFor = (image: string, company: string) => [
  { Dimension: "image", Level: image, Rank: "1", Show: "Yes" },
  { Dimension: "specification", Level: "High", Rank: "2", Show: "Yes" },
  { Dimension: "price", Level: "Medium", Rank: "3", Show: "Yes" },
  { Dimension: "company", Level: company, Rank: "4", Show: "Yes" },
  { Dimension: "unit", Level: "Low", Rank: "5", Show: "No" },
];

const configText = (version: string, ids: string[], image = "High") =>
  JSON.stringify({
    version,
    mcats: Object.fromEntries(
      ids.map((id) => [id, { importance_ranking: rankingFor(image, "High") }]),
    ),
  });

/** A file as it would be stored remotely, with its real SHA-256. */
async function storedFile(text: string, fileName = "mcatcontext.json") {
  const bytes = new TextEncoder().encode(text);
  const sha256 = await sha256Hex(bytes);
  const parsed = JSON.parse(text) as { version?: string; mcats: Record<string, unknown> };
  return {
    bytes,
    sha256,
    text,
    version: {
      version: parsed.version ?? "",
      fileName,
      mcatCount: Object.keys(parsed.mcats).length,
      warnings: [],
      uploadedBy: USER,
      uploadedAt: "2026-10-20T10:00:00.000Z",
    },
  };
}

async function cachedFrom(file: Awaited<ReturnType<typeof storedFile>>): Promise<CachedMcatConfig> {
  const version: McatConfigVersion = {
    ...file.version,
    id: 99,
    sha256: file.sha256,
    objectPath: `versions/${file.sha256}.json`,
    sizeBytes: file.bytes.byteLength,
  };
  return { sha256: file.sha256, text: file.text, version };
}

const details = () => screen.findByLabelText("Active MCAT configuration");

async function chooseFile(contents: string, name: string) {
  const input = await screen.findByLabelText("MCAT configuration JSON file");
  const file = new File([contents], name, { type: "application/json" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

beforeEach(() => window.localStorage.clear());

describe("sign-in", () => {
  it("explains when Supabase is not configured, without loading anything", () => {
    const remote = { ...createMemoryRemote(), configured: false };
    render(<PdpStudio mcatStorage={{ remote, cache: createMemoryCache() }} />);
    expect(screen.getByText(/Supabase is not configured for this build/)).toBeInTheDocument();
  });

  it("asks signed-out users to sign in and only sends links to @indiamart.com addresses", async () => {
    const remote = createMemoryRemote();
    render(<PdpStudio mcatStorage={{ remote, cache: createMemoryCache() }} />);
    const email = await screen.findByLabelText("Work email");

    fireEvent.change(email, { target: { value: "someone@gmail.com" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Use your @indiamart.com email address.");
    expect(remote.sentLinks).toEqual([]);

    fireEvent.change(email, { target: { value: USER } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    });
    expect(await screen.findByText(`Sign-in link sent to ${USER}`)).toBeInTheDocument();
    expect(remote.sentLinks).toEqual([USER]);
  });

  it("shows nothing to accounts outside @indiamart.com", async () => {
    const file = await storedFile(configText("v1", ["1"]));
    const remote = createMemoryRemote({ email: "x@gmail.com", files: [file] });
    render(<PdpStudio mcatStorage={{ remote, cache: createMemoryCache() }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only @indiamart.com accounts can use the MCAT configuration",
    );
    expect(screen.queryByLabelText("Active MCAT configuration")).not.toBeInTheDocument();
    expect(remote.downloads).toBe(0);
  });

  it("signing out hides the configuration and clears this browser's cache", async () => {
    const file = await storedFile(configText("v1", ["1"]));
    const cache = createMemoryCache();
    render(
      <PdpStudio
        mcatStorage={{ remote: createMemoryRemote({ email: USER, files: [file] }), cache }}
      />,
    );
    await details();
    expect(cache.record).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    });
    expect(await screen.findByLabelText("Work email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Active MCAT configuration")).not.toBeInTheDocument();
    expect(cache.record).toBeNull();
  });
});

describe("reading the shared configuration", () => {
  it("downloads the active version once, validates it and caches it", async () => {
    const file = await storedFile(configText("2026-10-01", ["1", "2", "3"]));
    const remote = createMemoryRemote({ email: USER, files: [file] });
    const cache = createMemoryCache();
    render(<PdpStudio mcatStorage={{ remote, cache }} />);

    const panel = await details();
    expect(panel).toHaveTextContent("2026-10-01");
    expect(panel).toHaveTextContent("downloaded from Supabase");
    expect(remote.downloads).toBe(1);
    await waitFor(() => expect(cache.record?.sha256).toBe(file.sha256));
  });

  it("does not download again when the cached copy has the active SHA-256", async () => {
    const file = await storedFile(configText("v1", ["1"]));
    const remote = createMemoryRemote({ email: USER, files: [file] });
    const cache = createMemoryCache({ record: await cachedFrom(file) });
    render(<PdpStudio mcatStorage={{ remote, cache }} />);

    expect(await details()).toHaveTextContent("from this browser's cache");
    await waitFor(() => expect(screen.queryByText("Checking…")).not.toBeInTheDocument());
    expect(remote.downloads).toBe(0);
    expect(cache.writes).toBe(0);
  });

  it("replaces a stale cached copy with the newer active version", async () => {
    const old = await storedFile(configText("old", ["1"]));
    const latest = await storedFile(configText("new", ["1", "2"]));
    const remote = createMemoryRemote({ email: USER, files: [latest] });
    const cache = createMemoryCache({ record: await cachedFrom(old) });
    render(<PdpStudio mcatStorage={{ remote, cache }} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Active MCAT configuration")).toHaveTextContent("new"),
    );
    expect(remote.downloads).toBe(1);
    expect(cache.record?.sha256).toBe(latest.sha256);
  });

  it.each([
    ["the download fails", { failDownload: true }, /Could not download/],
    [
      "the download does not match its SHA-256",
      { corruptDownload: true },
      /does not match its recorded SHA-256/,
    ],
  ])("keeps the cached configuration when %s", async (_label, failure, error) => {
    const old = await storedFile(configText("cached-v1", ["1"]));
    const latest = await storedFile(configText("remote-v2", ["1", "2"]));
    const remote = createMemoryRemote({ email: USER, files: [latest], ...failure });
    const cache = createMemoryCache({ record: await cachedFrom(old) });
    render(<PdpStudio mcatStorage={{ remote, cache }} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The configuration already in use was kept.",
    );
    expect(screen.getByLabelText("Active MCAT configuration")).toHaveTextContent("cached-v1");
    expect(cache.record?.sha256).toBe(old.sha256);
  });

  it("keeps the cached configuration when the active file in Supabase is invalid", async () => {
    const old = await storedFile(configText("cached-v1", ["1"]));
    const broken = await storedFile(JSON.stringify({ version: "bad", mcats: { "1": {} } }));
    const remote = createMemoryRemote({ email: USER, files: [broken] });
    const cache = createMemoryCache({ record: await cachedFrom(old) });
    render(<PdpStudio mcatStorage={{ remote, cache }} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "is not valid. The configuration already in use was kept.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      'mcats.1: needs an "importance_ranking" array',
    );
    expect(screen.getByLabelText("Active MCAT configuration")).toHaveTextContent("cached-v1");
    expect(cache.record?.sha256).toBe(old.sha256);
  });

  it("uses a valid download even when it cannot be cached, and says so", async () => {
    const file = await storedFile(configText("v1", ["1"]));
    const cache = createMemoryCache({ failWrite: true });
    render(
      <PdpStudio
        mcatStorage={{ remote: createMemoryRemote({ email: USER, files: [file] }), cache }}
      />,
    );

    expect(await details()).toHaveTextContent("downloaded from Supabase");
    expect(await screen.findByText(/Could not keep a copy in this browser/)).toBeInTheDocument();
    expect(cache.record).toBeNull();
  });

  it("starts empty, with no sample data, when nothing has been uploaded", async () => {
    render(
      <PdpStudio
        mcatStorage={{ remote: createMemoryRemote({ email: USER }), cache: createMemoryCache() }}
      />,
    );
    expect(
      await screen.findByText(/No MCAT configuration has been uploaded yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload MCAT JSON" })).toBeEnabled();
  });
});

describe("uploading a replacement", () => {
  it("validates, uploads and activates a new file for everyone, then caches it", async () => {
    const first = await storedFile(configText("v1", ["1"]));
    const remote = createMemoryRemote({ email: USER, files: [first] });
    const cache = createMemoryCache();
    render(<PdpStudio mcatStorage={{ remote, cache }} />);
    await details();

    const updated = configText("2026-11-01", ["1", "2", "3", "4"]);
    await chooseFile(updated, "mcatcontext-nov.json");

    expect(
      await screen.findByText(
        "mcatcontext-nov.json is now the active MCAT configuration for everyone",
      ),
    ).toBeInTheDocument();
    const expectedSha = await sha256Hex(new TextEncoder().encode(updated));
    expect(remote.activeVersion).toMatchObject({
      sha256: expectedSha,
      fileName: "mcatcontext-nov.json",
      uploadedBy: USER,
    });
    expect(screen.getByLabelText("Active MCAT configuration")).toHaveTextContent("2026-11-01");
    await waitFor(() => expect(cache.record?.sha256).toBe(expectedSha));
  });

  it("rejects an invalid file before uploading anything", async () => {
    const first = await storedFile(configText("v1", ["1"]));
    const remote = createMemoryRemote({ email: USER, files: [first] });
    render(<PdpStudio mcatStorage={{ remote, cache: createMemoryCache() }} />);
    await details();

    await chooseFile(
      JSON.stringify({ version: "bad", mcats: { "1": { ranking: [] } } }),
      "broken.json",
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "broken.json was not applied — the current configuration is unchanged",
    );
    expect(alert).toHaveTextContent('mcats.1: needs an "importance_ranking" array');
    expect(remote.activeVersion?.sha256).toBe(first.sha256);
    expect(screen.getByLabelText("Active MCAT configuration")).toHaveTextContent("v1");
  });

  it("keeps the previous configuration when the upload fails", async () => {
    const first = await storedFile(configText("v1", ["1"]));
    const remote = createMemoryRemote({ email: USER, files: [first], failUpload: true });
    const cache = createMemoryCache();
    render(<PdpStudio mcatStorage={{ remote, cache }} />);
    await details();
    await waitFor(() => expect(cache.record?.sha256).toBe(first.sha256));

    await chooseFile(configText("never-applied", ["5"]), "next.json");

    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed: Payload too large");
    expect(remote.activeVersion?.sha256).toBe(first.sha256);
    expect(screen.getByLabelText("Active MCAT configuration")).not.toHaveTextContent(
      "never-applied",
    );
    expect(cache.record?.sha256).toBe(first.sha256);
  });
});

describe("MCAT configuration in the five concepts", () => {
  it("connects the selected MCAT's ranking to every concept", async () => {
    const file = await storedFile(configText("v1", ["77"], "Low"));
    render(
      <PdpStudio
        mcatStorage={{
          remote: createMemoryRemote({ email: USER, files: [file] }),
          cache: createMemoryCache(),
        }}
      />,
    );
    await details();

    fireEvent.change(screen.getByLabelText("MCAT ID"), { target: { value: "77" } });
    expect(screen.getByText(/^Found: image Low/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 Concepts" }));

    // Fixture: image Low, company High.
    expect(screen.getByLabelText("MCAT 77 configuration")).toHaveTextContent(
      "im-lite serves Template4",
    );
    const checks = await screen.findAllByLabelText("MCAT priority check");
    expect(checks).toHaveLength(CONCEPTS.length);
    for (const check of checks) {
      expect(within(check).getByText(/^1\. image \(Low\)/)).toBeInTheDocument();
      expect(
        within(check).getByText(/^5\. unit \(Low\).*Show: No in the file/),
      ).toBeInTheDocument();
    }
  });

  it("says so when the MCAT ID is not in the configuration, and shows no checks", async () => {
    const file = await storedFile(configText("v1", ["1"]));
    render(
      <PdpStudio
        mcatStorage={{
          remote: createMemoryRemote({ email: USER, files: [file] }),
          cache: createMemoryCache(),
        }}
      />,
    );
    await details();

    fireEvent.change(screen.getByLabelText("MCAT ID"), { target: { value: "999" } });
    expect(screen.getByText("Not in the active configuration.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 Concepts" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "MCAT 999 is not in the active configuration",
    );
    expect(screen.queryByLabelText("MCAT priority check")).not.toBeInTheDocument();
  });

  it("restores the MCAT ID with the rest of the brief", async () => {
    const file = await storedFile(configText("v1", ["1", "2"]));
    const storage = {
      remote: createMemoryRemote({ email: USER, files: [file] }),
      cache: createMemoryCache(),
    };
    const { unmount } = render(<PdpStudio mcatStorage={storage} />);
    await details();
    fireEvent.change(screen.getByLabelText("MCAT ID"), { target: { value: "2" } });
    await waitFor(() =>
      expect(window.localStorage.getItem("indiamart-pdp-studio:v1") ?? "").toContain(
        '"mcatId":"2"',
      ),
    );
    unmount();

    render(<PdpStudio mcatStorage={storage} />);
    await waitFor(() => expect(screen.getByLabelText("MCAT ID")).toHaveValue("2"));
    await details();
    expect(screen.getByText(/^Found: image High/)).toBeInTheDocument();
  });
});
