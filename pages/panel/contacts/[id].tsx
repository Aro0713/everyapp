import { useRouter } from "next/router";
import CaseDetailLayout from "@/components/panel/CaseDetailLayout";

export default function Page() {
  const { id } = useRouter().query;

  return (
    <CaseDetailLayout title="Klient" subtitle="Widok klienta" id={id}>
      <div>TODO: klient</div>
    </CaseDetailLayout>
  );
}