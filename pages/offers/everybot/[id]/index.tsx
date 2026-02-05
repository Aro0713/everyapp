import { useRouter } from "next/router";
import EveryBotDetailsView from "@/components/EveryBotDetailsView.everybot";

export default function EveryBotDetailsPage() {
  const r = useRouter();
  const id = typeof r.query.id === "string" ? r.query.id : "";
  if (!id) return null;

  return (
    <main className="min-h-screen bg-[#F7F7F5] text-gray-900">
      <EveryBotDetailsView id={id} />
    </main>
  );
}
