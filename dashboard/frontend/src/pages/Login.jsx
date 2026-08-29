import { useState } from "react";
import { FiLock, FiLogIn, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1115] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#161922] p-8 shadow-xl"
      >
        <h1 className="mb-1 text-2xl font-semibold text-white">Tezebot Dashboard</h1>
        <p className="mb-6 text-sm text-gray-400">Davam etmək üçün daxil ol</p>

        <label className="mb-1 block text-sm text-gray-300">İstifadəçi adı</label>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-[#0f1115] px-3 py-2 focus-within:border-violet-500">
          <FiUser className="text-gray-500" />
          <input
            className="w-full bg-transparent text-white outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>

        <label className="mb-1 block text-sm text-gray-300">Şifrə</label>
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-white/10 bg-[#0f1115] px-3 py-2 focus-within:border-violet-500">
          <FiLock className="text-gray-500" />
          <input
            type="password"
            className="w-full bg-transparent text-white outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          <FiLogIn />
          {submitting ? "Yoxlanılır..." : "Daxil ol"}
        </button>
      </form>
    </div>
  );
}
