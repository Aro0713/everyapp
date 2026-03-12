export async function toolListingCreate(payload: any) {

  return {
    reply: "Przygotowałem dane do utworzenia oferty.",
    actions: [
      {
        type: "listing_create",
        payload
      }
    ]
  };

}