import { useRouter } from "next/router";
import type { ReactNode } from "react";

export default function CaseDetailLayout({
  title,
  subtitle,
  id,
  children,
}: {
  title: string;
  subtitle: string;
  id?: string | string[];
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-white/60 mt-1">{subtitle}</p>
          <p className="text-xs text-white/40 mt-2">ID: {id}</p>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}