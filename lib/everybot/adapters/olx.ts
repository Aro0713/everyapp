import { EverybotAdapter } from "./types";

const olxAdapter: EverybotAdapter = async (source) => {
  const baseUrl =
    source.meta?.url ??
    "https://www.olx.pl/oferta/test-mock";

  return [
    {
      source: "olx",
      source_listing_id: "OLX-MOCK-1",
      source_url: baseUrl,
      title: "MOCK OLX – dom jednorodzinny",
      description: "Mockowa oferta z adaptera OLX",
      price_amount: 1250000,
      currency: "PLN",
      location_text: "Tychy",
      status: "active",
    },
  ];
};

export default olxAdapter;
