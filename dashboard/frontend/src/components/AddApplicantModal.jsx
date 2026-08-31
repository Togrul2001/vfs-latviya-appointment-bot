import { useState } from "react";
import { FiX } from "react-icons/fi";

const inputClass =
  "mb-3 w-full rounded-lg border border-white/10 bg-[#0f1115] px-3 py-2 text-white outline-none focus:border-violet-500";
const labelClass = "mb-1 block text-sm text-gray-300";

// Doğuş <input type="date"> brauzerin öz OS lokalına görə mm/dd/yyyy göstərir və bunu
// web standartları ilə override etmək mümkün deyil — ona görə adi mətn sahəsi kimi
// GG/AA/İİİİ (gün əvvəl) formatını özümüz idarə edirik, yazdıqca "/" avtomatik əlavə olunur.
function formatDateTyping(value) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4, 8));
  return parts.join("/");
}

// GG/AA/İİİİ -> YYYY-MM-DD (backend hələ də ISO formatını gözləyir)
function dmyToIso(dmy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || "");
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

export default function AddApplicantModal({ onClose, onAdd }) {
  const [qrupId, setQrupId] = useState("1");
  const [ad, setAd] = useState("");
  const [soyad, setSoyad] = useState("");
  const [mail, setMail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [tarixBaslangic, setTarixBaslangic] = useState("");
  const [tarixBitis, setTarixBitis] = useState("");
  const [vizaNovu, setVizaNovu] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onAdd({
        qrupId,
        ad,
        soyad,
        mail,
        telefon,
        tarixBaslangic: dmyToIso(tarixBaslangic),
        tarixBitis: dmyToIso(tarixBitis),
        vizaNovu,
      });
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#161922] p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Yeni Ərizəçi Əlavə Et</h2>
          <button type="button" onClick={onClose} className="cursor-pointer text-gray-400 hover:text-white">
            <FiX />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <label className={labelClass}>Qrup ID</label>
            <input value={qrupId} onChange={(e) => setQrupId(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Viza Növü</label>
            <select value={vizaNovu} onChange={(e) => setVizaNovu(e.target.value)} className={inputClass}>
              <option value="1">Schengen vizası</option>
              <option value="2">Latviya milli vizası</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <label className={labelClass}>Ad</label>
            <input value={ad} onChange={(e) => setAd(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Soyad</label>
            <input value={soyad} onChange={(e) => setSoyad(e.target.value)} className={inputClass} />
          </div>
        </div>

        <label className={labelClass}>Mail</label>
        <input
          type="email"
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          required
          className={inputClass}
        />

        <label className={labelClass}>Telefon</label>
        <input value={telefon} onChange={(e) => setTelefon(e.target.value)} className={inputClass} />

        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <label className={labelClass}>Başlama Tarixi</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="GG/AA/İİİİ"
              maxLength={10}
              value={tarixBaslangic}
              onChange={(e) => setTarixBaslangic(formatDateTyping(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Bitmə Tarixi</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="GG/AA/İİİİ"
              maxLength={10}
              value={tarixBitis}
              onChange={(e) => setTarixBitis(formatDateTyping(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

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
