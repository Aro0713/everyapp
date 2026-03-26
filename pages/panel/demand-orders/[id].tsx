import { useRouter } from "next/router";
import CaseDetailLayout from "@/components/panel/CaseDetailLayout";

export default function Page() {
  const { id } = useRouter().query;

  return (
    <CaseDetailLayout title="Zlecenie popytowe" subtitle="Kupujący / Najemca" id={id}>
      <div>TODO: demand</div>
    </CaseDetailLayout>
  );
}