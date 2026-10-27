import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { STORAGE_BACKUP_KEY, STORAGE_KEY } from "@/lib/pdp/studio-state";

function importFile(contents: string, name = "brief.json") {
  const input = screen.getByLabelText("Import brief JSON file");
  const file = new File([contents], name, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Studio persistence and import", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("saves edits to localStorage and restores them on the next visit", async () => {
    const { unmount } = render(<PdpStudio />);
    fireEvent.change(screen.getByLabelText("MCAT name"), { target: { value: "Saved MCAT" } });
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY) ?? "").toContain("Saved MCAT"),
    );
    unmount();

    render(<PdpStudio />);
    await waitFor(() => expect(screen.getByLabelText("MCAT name")).toHaveValue("Saved MCAT"));
  });

  it("an invalid import leaves the current brief and saved data unchanged", async () => {
    render(<PdpStudio />);
    fireEvent.change(screen.getByLabelText("MCAT name"), { target: { value: "Keep me" } });
    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY) ?? "").toContain("Keep me"),
    );
    const savedBefore = window.localStorage.getItem(STORAGE_KEY);

    await act(async () => {
      importFile(
        JSON.stringify({
          app: "indiamart-pdp-studio",
          version: 1,
          mcat: "Should not appear",
          context: { sellerRating: 99 },
          products: [{ name: "x" }],
        }),
      );
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/was not imported/);
    expect(screen.getByRole("alert")).toHaveTextContent(/sellerRating/);
    expect(screen.getByLabelText("MCAT name")).toHaveValue("Keep me");
    await new Promise((r) => setTimeout(r, 400));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(savedBefore);
  });

  it("a valid import replaces the brief", async () => {
    render(<PdpStudio />);
    await act(async () => {
      importFile(
        JSON.stringify({
          app: "indiamart-pdp-studio",
          version: 1,
          mcat: "Imported MCAT",
          context: { brand: "Acme" },
          products: [{ name: "Imported product" }],
        }),
      );
    });
    await waitFor(() => expect(screen.getByLabelText("MCAT name")).toHaveValue("Imported MCAT"));
    expect(screen.getByLabelText("Product 1 name")).toHaveValue("Imported product");
  });

  it("keeps a backup of unreadable saved data instead of silently overwriting it", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{corrupted");
    render(<PdpStudio />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read/);
    expect(window.localStorage.getItem(STORAGE_BACKUP_KEY)).toBe("{corrupted");
  });
});
