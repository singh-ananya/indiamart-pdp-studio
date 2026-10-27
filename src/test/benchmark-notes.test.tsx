import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Route } from "@/routes/index";

// Radix Tabs unmount inactive panels, so any state kept inside a panel is lost
// when the user switches tabs. Benchmark notes must survive a round trip.
const Page = Route.options.component as React.ComponentType;

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  expect(tab).toHaveAttribute("aria-selected", "true");
}

describe("Benchmark notes", () => {
  it("keeps pasted notes after switching to another tab and back", () => {
    render(<Page />);

    openTab("Benchmark Comparison");
    const notes = screen.getByPlaceholderText(/One benchmark note per line/);
    fireEvent.change(notes, { target: { value: "My own note: CTA sits below gallery" } });

    openTab("Sources");
    openTab("Benchmark Comparison");

    expect(screen.getByPlaceholderText(/One benchmark note per line/)).toHaveValue(
      "My own note: CTA sits below gallery",
    );
    expect(
      screen.getByText("My own note: CTA sits below gallery", { selector: "li span" }),
    ).toBeInTheDocument();
  });
});
