import { useEffect, useState } from "react";
import { FiPlay, FiSquare } from "react-icons/fi";
import { getBotStatus, startBot, stopBot } from "../lib/api";

export default function BotControlCard() {
  const [running, setRunning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    getBotStatus()
      .then((data) => setRunning(data.running))
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  async function handleClick() {
    setBusy(true);
    setError("");
    try {
      if (running) await stopBot();
      else await startBot();
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const accent = running ? "bg-emerald-600/20 text-emerald-300" : "bg-red-600/20 text-red-300";

  return (
    <div className="rounded-xl border border-white/10 bg-[#161922] p-5">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg ${accent}`}>
        {running ? <FiPlay /> : <FiSquare />}
      </div>
      <div className="text-2xl font-semibold text-white">
        {running === null ? "—" : running ? "İşləyir" : "Dayandırılıb"}
      </div>
      <div className="mb-3 text-sm text-gray-400">Bot Statusu</div>
      <button
        onClick={handleClick}
        disabled={busy || running === null}
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
          running ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
        }`}
      >
        {running ? <FiSquare /> : <FiPlay />}
        {busy ? "Gözlə..." : running ? "Dayandır" : "Başlat"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
