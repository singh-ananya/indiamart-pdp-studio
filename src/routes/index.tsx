import { createFileRoute } from "@tanstack/react-router";
import { PdpStudio } from "@/components/pdp/studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PDP Genie — IndiaMART PDP UI/UX benchmarking" },
      {
        name: "description",
        content:
          "Benchmark and design IndiaMART product detail pages: five data-driven layout concepts from your MCAT, products and benchmark research, ranked with a transparent score.",
      },
      { property: "og:title", content: "PDP Genie — IndiaMART PDP UI/UX benchmarking" },
      {
        property: "og:description",
        content:
          "Five data-driven PDP concepts with mobile, desktop and first-fold previews, benchmark research and a transparent ranking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PdpStudio,
});
