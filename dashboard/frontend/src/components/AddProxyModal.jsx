import { useState } from "react";
import { FiX } from "react-icons/fi";

export default function AddProxyModal({ onClose, onAdd }) {
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onAdd({ server, username, password, active: true });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#161922] p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Yeni Proxy Əlavə Et</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-gray-400 hover:text-white"
          >
            <FiX />
          </button>
        </div>

        <label className="mb-1 block text-sm text-gray-300">Server (http://ip:port)</label>
        <input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="http://1.2.3.4:8080"
          required
          className="mb-3 w-full rounded-lg border border-white/10 bg-[#0f1115] px-3 py-2 text-white outline-none focus:border-violet-500"
        />

        <label className="mb-1 block text-sm text-gray-300">İstifadəçi adı</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded-lg border border-white/10 bg-[#0f1115] px-3 py-2 text-white outline-none focus:border-violet-500"
        />

        <label className="mb-1 block text-sm text-gray-300">Şifrə</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#0f1115] px-3 py-2 text-white outline-none focus:border-violet-500"
        />

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full cursor-pointer rounded-lg bg-violet-600 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {submitting ? "Əlavə edilir..." : "Əlavə Et"}
        </button>
      </form>
    </div>
  );
}
