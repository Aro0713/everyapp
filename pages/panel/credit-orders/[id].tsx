import { useRouter } from "next/router";
import CaseDetailLayout from "@/components/panel/CaseDetailLayout";

export default function Page() {
  const { id } = useRouter().query;

  return (
    <CaseDetailLayout title="Zlecenie kredytowe" subtitle="Proces kredytowy" id={id}>
      <div>TODO: credit</div>
    </CaseDetailLayout>
  );
}