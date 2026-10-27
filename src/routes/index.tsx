import { createFileRoute } from "@tanstack/react-router";
import { PdpStudio } from "@/components/pdp/studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IndiaMART PDP UI Generator" },
      {
        name: "description",
        content:
          "Design and preview five IndiaMART-style product detail page concepts from your MCAT, product and JSON inputs. Demo data only.",
      },
      { property: "og:title", content: "IndiaMART PDP UI Generator" },
      {
        property: "og:description",
        content:
          "Generate five distinct PDP layout concepts with mobile, desktop and first-fold previews.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PdpStudio,
});
