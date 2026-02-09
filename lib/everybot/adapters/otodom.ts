import { EverybotAdapter } from "./types";

const otodomAdapter: EverybotAdapter = async (source) => {
  // ⛔ TU NIE MA SCRAPINGU
  // ✅ MOCK – sprawdzamy zapis do external_listings

  const baseUrl =
    source.meta?.url ??
    "https://www.otodom.pl/pl/oferta/test-mock";

  return [
    {
      source: "otodom",
      source_listing_id: "OTODOM-MOCK-1",
      source_url: baseUrl,
      title: "MOCK Otodom – mieszkanie 3 pokoje",
      description: "Mockowa oferta z adaptera Otodom",
      price_amount: 799000,
      currency: "PLN",
      location_text: "Katowice",
      status: "active",
    },
  ];
};

export default otodomAdapter;
