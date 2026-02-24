import { useMemo, useRef, useState } from "react";

type Attachment = { name: string; mime: string; dataBase64: string };

type Msg = { role: "user" | "assistant"; text: string };

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function EverybotAgentPanel({
  onAgentResult,
}: {
  onAgentResult?: (r: { reply: string; actions: any[] }) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Napisz, co mam znaleźć. Możesz też dodać plik lub nagrać głosówkę." },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const canSend = useMemo(() => text.trim() || attachments.length, [text, attachments.length]);

  async function send() {
    if (!canSend || sending) return;
    const msg = text.trim();

    setSending(true);
    setMessages((prev) => [...prev, ...(msg ? [{ role: "user", text: msg } as Msg] : [])]);
    setText("");

    try {
      const r = await fetch("/api/everybot/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, attachments }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
     setMessages((prev) => [...prev, { role: "assistant", text: String(j?.reply ?? "OK") }]);

    if (j?.reply && onAgentResult) {
    onAgentResult({
        reply: String(j.reply),
        actions: Array.isArray(j.actions) ? j.actions : [],
    });
    }
      setAttachments([]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Błąd: ${e?.message ?? "unknown"}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || !files.length) return;

    const next: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 5)) {
      // limit 8MB na plik (MVP)
      if (f.size > 8 * 1024 * 1024) continue;
      const b64 = await fileToBase64(f);
      next.push({ name: f.name, mime: f.type || "application/octet-stream", dataBase64: b64 });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 5));
  }

  return (
    <div className="h-[70vh] rounded-3xl border border-gray-200 bg-white shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="text-sm font-extrabold text-ew-primary">Agent EveryBOT</div>
        <div className="text-xs text-gray-500">Tekst • głos • pliki</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, idx) => (
          <div key={idx} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={[
                "inline-block max-w-[92%] rounded-2xl px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-ew-accent/20 text-ew-primary"
                  : "bg-gray-100 text-gray-800",
              ].join(" ")}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {attachments.length > 0 && (
        <div className="px-4 pb-2 text-xs text-gray-600">
          Załączniki: {attachments.map((a) => a.name).join(", ")}
        </div>
      )}

      <div className="p-3 border-t border-gray-100 flex gap-2 items-center">
        <button
          type="button"
          className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-ew-primary hover:bg-ew-accent/10"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napisz do agenta…"
          className="flex-1 rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={sending}
        />

        <button
          type="button"
          className={[
            "rounded-2xl px-4 py-2 text-xs font-extrabold shadow-sm",
            canSend && !sending
              ? "bg-ew-accent text-ew-primary hover:opacity-95"
              : "bg-gray-100 text-gray-400 cursor-not-allowed",
          ].join(" ")}
          onClick={send}
          disabled={!canSend || sending}
        >
          Wyślij
        </button>
      </div>
    </div>
  );
}