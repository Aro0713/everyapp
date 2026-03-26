import { useEffect, useState } from "react";

export function useOfferDetails(id: string | null) {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!id) return;

    setLoading(true);

    const details = await fetch(`/api/offers/details?id=${id}`).then(r => r.json());
    const hist = await fetch(`/api/offers/history-list?id=${id}`).then(r => r.json());

    setData(details);
    setHistory(hist.rows ?? []);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  return {
    data,
    history,
    reload: load,
    loading,
  };
}