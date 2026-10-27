import type { Product } from "./types";

export { parsePdpContext } from "./schema";

/**
 * Every value in this file is DEMO DATA for layout design only.
 * It must stay clearly labeled as demo — never present it as real
 * product, supplier, or benchmark information.
 */

export const DEFAULT_MCAT = "Water Bottles (demo)";

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Stainless Steel Vacuum Flask 1 L (demo)",
    price: "349",
    priceMax: "",
    unit: "",
    moq: "50 pieces",
    highlights: "Keeps drinks hot 12 hrs (demo), Leak-proof lid (demo)",
    specs:
      "Material: Stainless steel (demo)\nCapacity: 1 litre (demo)\nFinish: Matte powder coat (demo)",
    description: "Demo description: double-walled vacuum flask for bulk gifting and retail packs.",
    imageUrls: [],
  },
  {
    id: "p2",
    name: "Hammered Copper Bottle 950 ml (demo)",
    price: "529",
    priceMax: "",
    unit: "",
    moq: "100 pieces",
    highlights: "Ayurvedic copper claim (demo), Hand-hammered finish (demo)",
    specs: "Material: Copper (demo)\nCapacity: 950 ml (demo)\nWeight: 280 g (demo)",
    description: "Demo description: traditional hammered copper bottle supplied in export cartons.",
    imageUrls: [],
  },
  {
    id: "p3",
    name: "Tritan Sports Sipper 750 ml (demo)",
    price: "159",
    priceMax: "",
    unit: "",
    moq: "200 pieces",
    highlights: "BPA-free Tritan (demo), Flip-top nozzle (demo)",
    specs: "Material: Tritan plastic (demo)\nCapacity: 750 ml (demo)\nColors: 4 (demo)",
    description: "Demo description: lightweight gym sipper with printed logo branding option.",
    imageUrls: [],
  },
  {
    id: "p4",
    name: "Glass Bottle with Silicone Sleeve 550 ml (demo)",
    price: "219",
    priceMax: "",
    unit: "",
    moq: "100 pieces",
    highlights: "Borosilicate glass (demo), Anti-slip sleeve (demo)",
    specs: "Material: Borosilicate glass (demo)\nCapacity: 550 ml (demo)\nSleeve: Silicone (demo)",
    description: "Demo description: premium glass bottle aimed at organic stores and cafes.",
    imageUrls: [],
  },
  {
    id: "p5",
    name: "Insulated Thermo Steel Bottle 750 ml (demo)",
    price: "399",
    priceMax: "",
    unit: "",
    moq: "100 pieces",
    highlights: "Hot & cold 10 hrs (demo), Rust-proof interior (demo)",
    specs: "Material: Thermo steel (demo)\nCapacity: 750 ml (demo)\nWarranty: 6 months (demo)",
    description: "Demo description: mid-range insulated bottle for corporate gifting orders.",
    imageUrls: [],
  },
];

export const DEFAULT_CONTEXT_JSON = `{
  "brand": "AquaPure Industries (demo)",
  "category": "Water Bottles (demo)",
  "city": "Delhi (demo)",
  "offer": "5% off on first bulk order (demo)",
  "usps": [
    "BPA-free materials (demo)",
    "Export-grade packaging (demo)"
  ]
}`;

export const EMPTY_PRODUCT: Product = {
  id: "empty",
  name: "",
  price: "",
  priceMax: "",
  unit: "",
  moq: "",
  highlights: "",
  specs: "",
  description: "",
  imageUrls: [],
};
