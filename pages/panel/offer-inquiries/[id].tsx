import { useRouter } from "next/router";
import CaseDetailLayout from "@/components/panel/CaseDetailLayout";

export default function Page() {
  const { id } = useRouter().query;

  return (
    <CaseDetailLayout title="Zapytanie ofertowe" subtitle="Powiązane z ofertą" id={id}>
      <div>TODO: inquiry</div>
    </CaseDetailLayout>
  );
}