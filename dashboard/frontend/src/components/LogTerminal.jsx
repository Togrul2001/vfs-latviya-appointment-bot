import { useEffect, useRef, useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { useLogSocket } from "../lib/useLogSocket";

const MAX_LINES = 500;

export default function LogTerminal() {
  const [lines, setLines] = useState([]);
  const containerRef = useRef(null);
  // WebSocket reconnect olanda server tarixçəni YENİDƏN göndərir (bu özü doğrudur) —
  // amma əvvəlki tarixçə eyni sətirləri artıq göstərdiyi üçün, yeni tarixçə başlayanda
  // (historyDone false-a düşəndə) köhnə sətirləri təmizləməliyik ki, təkrarlanmasın.
  const wasHistoryDoneRef = useRef(false);

  const connected = useLogSocket((line, historyDone) => {
    if (!historyDone && wasHistoryDoneRef.current) {
      setLines([]);
    }
    wasHistoryDoneRef.current = historyDone;
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  });

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-300">Canlı Loglar</h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${connected ? "text-emerald-400" : "text-gray-500"}`}>
            {connected ? "● Qoşulu" : "○ Qoşulmayıb"}
          </span>
          <button
            onClick={() => setLines([])}
            title="Logları təmizlə"
            className="cursor-pointer rounded p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-64 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-gray-300"
      >
        {lines.length === 0 ? (
          <p className="text-gray-500">Bot işə düşəndə loglar burada canlı görünəcək</p>
        ) : (
          lines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
    </div>
  );
}
