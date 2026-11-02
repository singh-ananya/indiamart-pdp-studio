import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// The full studio renders a lot; under a busy test run the 1 s default for findBy*/waitFor
// occasionally ran out before async loading finished.
configure({ asyncUtilTimeout: 3000 });

// Tests never touch the network. Code that needs it gets a fake fetch injected.
globalThis.fetch = (() =>
  Promise.reject(new Error("Network access is disabled in tests"))) as typeof fetch;

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
