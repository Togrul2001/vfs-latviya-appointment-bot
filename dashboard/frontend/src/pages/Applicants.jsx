import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiCheckCircle, FiClock, FiDownload, FiEdit2, FiPlus, FiTrash2, FiUpload, FiUsers, FiX } from "react-icons/fi";
import AddApplicantModal from "../components/AddApplicantModal";
import Layout from "../components/Layout";
import TruncateCell from "../components/TruncateCell";
import { addApplicant, deleteApplicant, getApplicants, updateApplicant, uploadApplicants } from "../lib/api";

const FILTERS = [
  { key: "all", label: "Hamısı", icon: FiUsers, accent: "violet" },
  { key: "pending", label: "Gözləyir", icon: FiClock, accent: "amber" },
  { key: "done", label: "Yer götürüldü", icon: FiCheckCircle, accent: "green" },
];

const ACCENTS = {
  violet: { ring: "ring-violet-500", icon: "bg-violet-600/20 text-violet-300" },
  amber: { ring: "ring-amber-500", icon: "bg-amber-600/20 text-amber-300" },
  green: { ring: "ring-emerald-500", icon: "bg-emerald-600/20 text-emerald-300" },
};

const STATUS_OPTIONS = ["", "Gözləyir", "Yer götürüldü", "Görüşü var"];
const GROUP_OPTIONS = Array.from({ length: 50 }, (_, i) => String(i + 1));
const VIZA_OPTIONS = [
  { value: "1", label: "Schengen vizası" },
  { value: "2", label: "Latviya milli vizası" },
];

function statusBadgeClass(a) {
  const s = a.status.trim().toLowerCase();
  if (s === "yer götürüldü") return "bg-emerald-600/20 text-emerald-300";
  if (s === "görüşü var") return "bg-blue-600/20 text-blue-300";
  return "bg-amber-600/20 text-amber-300";
}

export default function Applicants() {
  const [applicants, setApplicants] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, done: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fileExists, setFileExists] = useState(true);
  const [actionError, setActionError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingKey, setEditingKey] = useState(null); // redaktə olunan sətrin KÖHNƏ maili
  const [editData, setEditData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef(null);

  const EDIT_FIELDS = [
    "qrupId", "ad", "soyad", "mail", "telefon",
    "tarixBaslangic", "tarixBitis", "vizaNovu", "status",
  ];

  function startEdit(a) {
    setEditingKey(a.mail);
    const data = {};
    for (const f of EDIT_FIELDS) data[f] = a[f] ?? "";
    setEditData(data);
    setActionError("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditData({});
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      await updateApplicant(editingKey, editData);
      cancelEdit();
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    return getApplicants()
      .then((data) => {
        setApplicants(data.applicants);
        setSummary(data.summary);
        setFileExists(data.fileExists !== false);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleChange(mail, updates) {
    try {
      await updateApplicant(mail, updates);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Mövcud applicants.xlsx faylı silinib yenisi ilə əvəz olunacaq. Davam edilsin?")) return;

    setUploading(true);
    setActionError("");
    try {
      await uploadApplicants(file);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAdd(applicant) {
    await addApplicant(applicant);
    await load();
  }

  async function handleDelete(mail) {
    if (!window.confirm(`${mail} silinsin? Excel-dəki sətir də silinəcək.`)) return;
    try {
      await deleteApplicant(mail);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "pending") return applicants.filter((a) => a.isPending);
    if (filter === "done") return applicants.filter((a) => !a.isPending);
    return applicants;
  }, [applicants, filter]);

  const counts = { all: summary.total, pending: summary.pending, done: summary.done };

  const editCell = (field, w = "6.5rem") => (
    <input
      value={editData[field] ?? ""}
      onChange={(e) => setEditData((d) => ({ ...d, [field]: e.target.value }))}
      style={{ width: w }}
      className="rounded border-0 bg-white/10 px-2 py-0.5 text-xs text-gray-100 outline-none focus:ring-1 focus:ring-violet-500"
    />
  );

  return (
    <Layout title="Ərizəçilər">
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-400">applicants.xlsx faylını idarə et</p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {actionError && <span className="text-xs text-red-400 sm:text-sm">{actionError}</span>}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              <FiPlus />
              Əlavə Et
            </button>
            {fileExists && (
              <a
                href="/api/applicants/download"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm"
              >
                <FiDownload />
                Excel Endir
              </a>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-60 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              <FiUpload />
              {uploading ? "Yüklənir..." : "Excel Yüklə"}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        {!loading && !error && !fileExists ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-[#161922] text-center">
            <p className="text-sm text-gray-300">Excel faylı tapılmadı</p>
            <p className="text-xs text-gray-500">"Excel Yüklə" və ya "Əlavə Et" ilə başla</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
              {FILTERS.map(({ key, label, icon: Icon, accent }) => {
                const selected = filter === key;
                const { ring, icon } = ACCENTS[accent];
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`cursor-pointer rounded-xl border border-white/10 bg-[#161922] p-5 text-left transition ${
                      selected ? `ring-2 ${ring}` : "hover:border-white/20"
                    }`}
                  >
                    <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg ${icon}`}>
                      <Icon />
                    </div>
                    <div className="text-2xl font-semibold text-white">{counts[key]}</div>
                    <div className="text-sm text-gray-400">{label}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex min-h-[320px] flex-1 flex-col rounded-xl border border-white/10 bg-[#161922]">
              <div className="shrink-0 border-b border-white/10 px-5 py-3 text-sm font-medium text-gray-300">
                {filtered.length} ərizəçi göstərilir
              </div>

              {loading ? (
                <div className="p-6 text-sm text-gray-500">Yüklənir...</div>
              ) : error ? (
                <div className="p-6 text-sm text-red-400">{error}</div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-max text-left text-sm">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Qrup ID</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Ad</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Soyad</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Mail</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Telefon</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Başlama Tarixi</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Bitmə Tarixi</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Viza Növü</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Status</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Əməliyyatlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      const isEditing = editingKey === a.mail;
                      return (
                      <tr key={a.mail} className="border-t border-white/5 text-gray-300">
                        <td className="px-5 py-2">
                          {isEditing ? (
                            editCell("qrupId", "3.5rem")
                          ) : (
                          <select
                            value={a.qrupId}
                            onChange={(e) => handleChange(a.mail, { qrupId: e.target.value })}
                            className="w-16 cursor-pointer truncate rounded border-0 bg-white/5 px-2 py-0.5 text-xs"
                          >
                            {!GROUP_OPTIONS.includes(a.qrupId) && (
                              <option value={a.qrupId} className="bg-[#161922] text-gray-200">
                                {a.qrupId || "—"}
                              </option>
                            )}
                            {GROUP_OPTIONS.map((g) => (
                              <option key={g} value={g} className="bg-[#161922] text-gray-200">
                                {g}
                              </option>
                            ))}
                          </select>
                          )}
                        </td>
                        <td className="px-5 py-2">
                          {isEditing ? editCell("ad") : <TruncateCell value={a.ad} maxWidth="6rem" />}
                        </td>
                        <td className="px-5 py-2">
                          {isEditing ? editCell("soyad") : <TruncateCell value={a.soyad} maxWidth="6rem" />}
                        </td>
                        <td className="px-5 py-2 text-gray-500">
                          {isEditing ? editCell("mail", "9rem") : <TruncateCell value={a.mail} maxWidth="9rem" />}
                        </td>
                        <td className="px-5 py-2 text-gray-500">
                          {isEditing ? editCell("telefon") : <TruncateCell value={a.telefon} maxWidth="6rem" />}
                        </td>
                        <td className="px-5 py-2 text-gray-500">
                          {isEditing ? editCell("tarixBaslangic") : <TruncateCell value={a.tarixBaslangic} maxWidth="6rem" />}
                        </td>
                        <td className="px-5 py-2 text-gray-500">
                          {isEditing ? editCell("tarixBitis") : <TruncateCell value={a.tarixBitis} maxWidth="6rem" />}
                        </td>
                        <td className="px-5 py-2">
                          {isEditing ? (
                            <select
                              value={editData.vizaNovu ?? ""}
                              onChange={(e) => setEditData((d) => ({ ...d, vizaNovu: e.target.value }))}
                              className="w-32 cursor-pointer truncate rounded border-0 bg-white/10 px-2 py-0.5 text-xs text-gray-100 outline-none focus:ring-1 focus:ring-violet-500"
                            >
                              {!VIZA_OPTIONS.some((v) => v.value === (editData.vizaNovu ?? "")) && (
                                <option value={editData.vizaNovu ?? ""} className="bg-[#161922] text-gray-200">
                                  {editData.vizaNovu || "—"}
                                </option>
                              )}
                              {VIZA_OPTIONS.map((v) => (
                                <option key={v.value} value={v.value} className="bg-[#161922] text-gray-200">
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                          <select
                            value={a.vizaNovu}
                            onChange={(e) => handleChange(a.mail, { vizaNovu: e.target.value })}
                            className="w-32 cursor-pointer truncate rounded border-0 bg-white/5 px-2 py-0.5 text-xs"
                          >
                            {!VIZA_OPTIONS.some((v) => v.value === a.vizaNovu) && (
                              <option value={a.vizaNovu} className="bg-[#161922] text-gray-200">
                                {a.vizaNovu || "—"}
                              </option>
                            )}
                            {VIZA_OPTIONS.map((v) => (
                              <option key={v.value} value={v.value} className="bg-[#161922] text-gray-200">
                                {v.label}
                              </option>
                            ))}
                          </select>
                          )}
                        </td>
                        <td className="px-5 py-2">
                          {isEditing ? (
                            editCell("status", "7rem")
                          ) : (
                          <select
                            value={a.status}
                            onChange={(e) => handleChange(a.mail, { status: e.target.value })}
                            className={`w-28 cursor-pointer truncate rounded border-0 px-2 py-0.5 text-xs ${statusBadgeClass(a)}`}
                          >
                            {!STATUS_OPTIONS.includes(a.status) && (
                              <option value={a.status} className="bg-[#161922] text-gray-200">
                                {a.status || "Boş"}
                              </option>
                            )}
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s} className="bg-[#161922] text-gray-200">
                                {s === "" ? "Boş" : s}
                              </option>
                            ))}
                          </select>
                          )}
                        </td>
                        <td className="px-5 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-3">
                              <button
                                onClick={saveEdit}
                                disabled={savingEdit}
                                title="Təsdiq et"
                                className="cursor-pointer text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                              >
                                <FiCheck />
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                title="Bağla"
                                className="cursor-pointer text-gray-400 hover:text-gray-200 disabled:opacity-50"
                              >
                                <FiX />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => startEdit(a)}
                                title="Redaktə et"
                                className="cursor-pointer text-violet-400 hover:text-violet-300"
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                onClick={() => handleDelete(a.mail)}
                                title="Sil"
                                className="cursor-pointer text-red-400 hover:text-red-300"
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAddModal && <AddApplicantModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />}
    </Layout>
  );
}
