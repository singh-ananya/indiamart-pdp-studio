import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  expect(tab).toHaveAttribute("aria-selected", "true");
}

describe("JSON Context tab", () => {
  beforeEach(() => window.localStorage.clear());

  it("holds the context editor and keeps edits across tab switches", () => {
    render(<PdpStudio />);
    expect(screen.queryByLabelText("JSON context editor")).toBeNull();

    openTab("JSON Context");
    fireEvent.change(screen.getByLabelText("JSON context editor"), {
      target: { value: '{ "brand": "Kept" }' },
    });
    openTab("Five Concepts");
    openTab("JSON Context");
    expect(screen.getByLabelText("JSON context editor")).toHaveValue('{ "brand": "Kept" }');
  });

  it("flags an invalid context in the brief with a link to the tab", () => {
    render(<PdpStudio />);
    openTab("JSON Context");
    fireEvent.change(screen.getByLabelText("JSON context editor"), {
      target: { value: '{ "sellerRating": 9 }' },
    });
    openTab("Five Concepts");

    expect(screen.getByRole("alert")).toHaveTextContent("previews will not use it");
    fireEvent.click(screen.getByRole("button", { name: "Open the JSON Context tab" }));
    expect(screen.getByRole("tab", { name: "JSON Context" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("JSON context editor")).toHaveValue('{ "sellerRating": 9 }');
    expect(screen.getAllByText(/sellerRating: must be 5 or less/).length).toBeGreaterThan(0);
  });
});

describe("Product Cards tab", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the five product cards in their own tab, not in the brief", () => {
    render(<PdpStudio />);
    expect(screen.getByLabelText("Product 1 name")).not.toBeVisible();

    openTab("Product Cards");
    const panel = screen.getByRole("tabpanel");
    for (let n = 1; n <= 5; n++) {
      expect(within(panel).getByLabelText(`Product ${n} name`)).toBeVisible();
    }
  });

  it("keeps edits, including a half-typed image URL, when switching tabs", () => {
    render(<PdpStudio />);
    openTab("Product Cards");
    fireEvent.change(screen.getByLabelText("Product 2 name"), { target: { value: "Edited name" } });
    fireEvent.change(screen.getByLabelText("Product 2 image URLs"), {
      target: { value: "https://img.example/a.jpg\nhttps://img.exa" },
    });

    openTab("Five Concepts");
    expect(screen.getByLabelText("Product 2 name")).not.toBeVisible();
    openTab("Product Cards");

    expect(screen.getByLabelText("Product 2 name")).toHaveValue("Edited name");
    expect(screen.getByLabelText("Product 2 image URLs")).toHaveValue(
      "https://img.example/a.jpg\nhttps://img.exa",
    );
  });
});
