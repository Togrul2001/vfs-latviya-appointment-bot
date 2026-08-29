import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { FiBell, FiCompass, FiSend, FiSmartphone } from "react-icons/fi";
import Layout from "../components/Layout";
import { unlockAudio } from "../lib/alertSound";
import {
  isSoundEnabled,
  isVibrationEnabled,
  setSoundEnabled,
  setVibrationEnabled,
} from "../lib/alertSettings";
import {
  getTelegramStatus,
  getVisaCategory,
  linkTelegram,
  setVisaCategory,
  unlinkTelegram,
} from "../lib/api";

const VISA_CATEGORIES = ["Tourist", "Business"];

function VisaCategorySection() {
  const [category, setCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getVisaCategory()
      .then((r) => setCategory(r.visaCategory))
      .catch(() => {});
  }, []);

  async function handleSelect(next) {
    if (next === category || saving) return;
    setError("");
    setSaving(true);
    const prev = category;
    setCategory(next);
    try {
      await setVisaCategory(next);
    } catch (err) {
      setCategory(prev);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#161922] p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300">
          <FiCompass />
        </div>
        <div>
          <div className="text-sm font-medium text-white">Viza Kateqoriyası</div>
          <div className="text-xs text-gray-400">Bot randevu axtararkən hansı kateqoriyanı seçsin</div>
        </div>
      </div>
      <div className="flex gap-2">
        {VISA_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => handleSelect(c)}
            disabled={saving}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              category === c
                ? "bg-violet-600 text-white"
                : "border border-white/10 text-gray-300 hover:bg-white/5"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#161922] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300">
          <Icon />
        </div>
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="text-xs text-gray-400">{description}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? "bg-emerald-600" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function TelegramSection() {
  const [status, setStatus] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    refreshStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  function refreshStatus() {
    getTelegramStatus()
      .then(setStatus)
      .catch(() => {});
  }

  async function handleConnect() {
    setError("");
    setLoading(true);
    try {
      const { url } = await linkTelegram();
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
      setQrDataUrl(dataUrl);

      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const s = await getTelegramStatus().catch(() => null);
        if (s?.linked) {
          clearInterval(pollRef.current);
          setStatus(s);
          setQrDataUrl(null);
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Telegram bağlantısını kəsmək istəyirsən?")) return;
    await unlinkTelegram();
    clearInterval(pollRef.current);
    setQrDataUrl(null);
    refreshStatus();
  }

  if (!status) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#161922] p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300">
          <FiSend />
        </div>
        <div>
          <div className="text-sm font-medium text-white">Telegram Bildirişləri</div>
          <div className="text-xs text-gray-400">Bot yer tapanda Telegram-a mesaj göndərilsin</div>
        </div>
      </div>

      {!status.botConfigured ? (
        <p className="text-xs text-amber-400">Server tərəfdə Telegram bot konfiqurasiya olunmayıb (.env).</p>
      ) : status.linked ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded bg-emerald-600/20 px-3 py-1 text-sm text-emerald-300">✅ Qoşuldu</span>
          <button
            onClick={handleDisconnect}
            className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5"
          >
            Bağlantını Kəs
          </button>
        </div>
      ) : qrDataUrl ? (
        <div className="flex flex-col items-center gap-3">
          <img src={qrDataUrl} alt="Telegram QR kodu" className="rounded-lg bg-white p-2" />
          <p className="text-xs text-gray-400">Telefonla QR-u oxu, Telegram açılacaq — botu "Start" et</p>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="cursor-pointer rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {loading ? "Yüklənir..." : "Qoşul"}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function Settings() {
  const [sound, setSound] = useState(false);
  const [vibration, setVibration] = useState(false);

  useEffect(() => {
    setSound(isSoundEnabled());
    setVibration(isVibrationEnabled());
  }, []);

  function toggleSound(next) {
    setSound(next);
    setSoundEnabled(next);
    // Klik (user gesture) daxilindəyik — səsi elə indi "kilidini aç" ki, sonra sərbəst çalına bilsin
    if (next) unlockAudio();
  }

  function toggleVibration(next) {
    setVibration(next);
    setVibrationEnabled(next);
    if (next && navigator.vibrate) {
      try {
        navigator.vibrate(80);
      } catch {
        // dəstəklənmirsə səssiz keç
      }
    }
  }

  return (
    <Layout title="Ayarlar">
      <div className="flex max-w-lg flex-col gap-4">
        <ToggleRow
          icon={FiBell}
          title="Səs siqnalı"
          description="Bot yer tapanda brauzerdə bip səsi çalınsın"
          checked={sound}
          onChange={toggleSound}
        />
        <ToggleRow
          icon={FiSmartphone}
          title="Vibrasiya"
          description="Bot yer tapanda telefon titrəsin (yalnız Android)"
          checked={vibration}
          onChange={toggleVibration}
        />
        <VisaCategorySection />
        <TelegramSection />
      </div>
    </Layout>
  );
}
