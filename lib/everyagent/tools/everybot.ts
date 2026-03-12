export async function toolEverybotSearch(message: string) {

  const r = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/everybot/agent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    }
  );

  const j = await r.json();

  return j;

}