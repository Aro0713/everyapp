import { useRouter } from "next/router";
import CaseDetailLayout from "@/components/panel/CaseDetailLayout";

export default function Page() {
  const { id } = useRouter().query;

  return (
    <CaseDetailLayout title="Zlecenie ubezpieczeniowe" subtitle="Proces ubezpieczeniowy" id={id}>
      <div>TODO: insurance</div>
    </CaseDetailLayout>
  );
}