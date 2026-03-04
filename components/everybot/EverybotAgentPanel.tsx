import { useMemo, useRef, useState, useEffect } from "react";

type Attachment = { name: string; mime: string; dataBase64: string };

type Msg = { role: "user" | "assistant"; text: string };

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function EverybotAgentPanel({
  onAgentResult,
  contextFilters,
}: {
  onAgentResult?: (r: { reply: string; actions: any[] }) => void;
  contextFilters?: Record<string, any>;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Napisz, co mam znaleźć. Możesz też dodać plik lub nagrać głosówkę." },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // --- speech-to-text (browser) ---
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const interimRef = useRef<string>("");

  useEffect(() => {
    // Web Speech API (Chrome/Edge)
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    setSpeechSupported(true);

    const rec: SpeechRecognitionLike = new SR();
    rec.lang = "pl-PL";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev: any) => {
      let interim = "";
      let finalText = "";

      // ev.results: SpeechRecognitionResultList
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const transcript = String(res?.[0]?.transcript ?? "");
        if (res.isFinal) finalText += transcript;
        else interim += transcript;
      }

      // interim pokazujemy w textarea "na żywo" bez niszczenia tego co user ma
      interimRef.current = interim;

      if (finalText.trim()) {
        setText((prev) => {
          const base = prev.trimEnd();
          const add = finalText.trim();
          return base ? `${base}\n${add}` : add;
        });
      } else {
        // tylko interim -> aktualizuj wizualnie (doklej w kontrolowany sposób)
        setText((prev) => {
          const base = prev.replace(/\s*\[mowa:\s[\s\S]*\]$/, "").trimEnd();
          const iTxt = interimRef.current.trim();
          if (!iTxt) return base;
          return `${base}${base ? "\n" : ""}[mowa: ${iTxt}]`;
        });
      }
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      interimRef.current = "";
      // usuń ewentualny placeholder [mowa: ...]
      setText((prev) => prev.replace(/\s*\[mowa:\s[\s\S]*\]$/, "").trimEnd());
    };

    recogRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {}
      recogRef.current = null;
    };
  }, []);

  const canSend = useMemo(() => (text.trim() || attachments.length > 0) && !isListening, [
    text,
    attachments.length,
    isListening,
  ]);

  async function send() {
    if (!canSend || sending) return;
    const msg = text.trim();

    setSending(true);
    setMessages((prev) => [...prev, ...(msg ? [{ role: "user", text: msg } as Msg] : [])]);
    setText("");

    try {
      const history = [...messages, ...(msg ? [{ role: "user", text: msg } as Msg] : [])]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10);

      const r = await fetch("/api/everybot/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, attachments, contextFilters, history }),
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
      setMessages((prev) => [...prev, { role: "assistant", text: `Błąd: ${e?.message ?? "unknown"}` }]);
    } finally {
      setSending(false);
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || !files.length) return;

    const next: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 5)) {
      if (f.size > 8 * 1024 * 1024) continue;
      const b64 = await fileToBase64(f);
      next.push({ name: f.name, mime: f.type || "application/octet-stream", dataBase64: b64 });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 5));
  }

  function removeAttachment(name: string) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  function toggleMic() {
    if (!speechSupported) return;
    if (sending) return;

    const rec = recogRef.current;
    if (!rec) return;

    if (isListening) {
      try {
        rec.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    // usuń placeholder [mowa: ...] przed startem
    setText((prev) => prev.replace(/\s*\[mowa:\s[\s\S]*\]$/, "").trimEnd());

    interimRef.current = "";
    try {
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }

  return (
    <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-slate-950/45 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="text-sm font-extrabold text-white/90">Agent EveryBOT</div>
        <div className="text-xs text-white/55">Tekst • głos • pliki</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
        {messages.map((m, idx) => (
          <div key={idx} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={clsx(
                "inline-block max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-snug",
                m.role === "user"
                  ? "bg-white/10 text-white border border-white/10"
                  : "bg-white/5 text-white/85 border border-white/10"
              )}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {attachments.length > 0 && (
        <div className="px-4 pb-2 text-[11px] text-white/70">
          <div className="mb-1 text-white/60">Załączniki:</div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <span
                key={a.name}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1"
              >
                <span className="max-w-[180px] truncate">{a.name}</span>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] text-white/80 hover:bg-white/15"
                  onClick={() => removeAttachment(a.name)}
                  disabled={sending}
                  title="Usuń załącznik"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-t border-white/10 bg-white/5 flex gap-2 items-end">
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60"
          onClick={() => fileRef.current?.click()}
          disabled={sending || isListening}
          title="Dodaj załącznik"
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

        <button
          type="button"
          className={clsx(
            "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition",
            speechSupported && !sending
              ? isListening
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                : "border-white/10 bg-white/10 text-white hover:bg-white/15"
              : "border-white/10 bg-white/5 text-white/35 cursor-not-allowed"
          )}
          onClick={toggleMic}
          disabled={!speechSupported || sending}
          title={speechSupported ? "Nagrywaj i transkrybuj do tekstu" : "Brak obsługi SpeechRecognition w tej przeglądarce"}
        >
          {isListening ? "🎙️ Stop" : "🎙️"}
        </button>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napisz / wklej notatki do agenta… (Enter = wyślij, Shift+Enter = nowa linia)"
          className="flex-1 resize-none min-h-[44px] max-h-[140px] rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20"
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
          className={clsx(
            "rounded-xl px-4 py-2 text-xs font-extrabold shadow-sm transition",
            canSend && !sending
              ? "border border-white/10 bg-white/15 text-white hover:bg-white/20"
              : "border border-white/10 bg-white/5 text-white/35 cursor-not-allowed"
          )}
          onClick={send}
          disabled={!canSend || sending}
          title={isListening ? "Zatrzymaj nagrywanie zanim wyślesz" : "Wyślij do agenta"}
        >
          Wyślij
        </button>
      </div>
    </div>
  );
}