import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiDownload,
  FiEdit2,
  FiPlus,
  FiTrash2,
  FiUpload,
  FiUsers,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import AddAccountModal from "../components/AddAccountModal";
import Layout from "../components/Layout";
import { addAccount, deleteAccount, getAccounts, updateAccount, updateAccountStatus, uploadAccounts } from "../lib/api";

const FILTERS = [
  { key: "all", label: "Hamısı", icon: FiUsers, accent: "violet" },
  { key: "active", label: "Aktiv", icon: FiCheckCircle, accent: "green" },
  { key: "blocked", label: "Bloklanmış", icon: FiXCircle, accent: "amber" },
  { key: "error", label: "Xətalı", icon: FiAlertTriangle, accent: "red" },
];

const ACCENTS = {
  violet: { ring: "ring-violet-500", icon: "bg-violet-600/20 text-violet-300" },
  green: { ring: "ring-emerald-500", icon: "bg-emerald-600/20 text-emerald-300" },
  amber: { ring: "ring-amber-500", icon: "bg-amber-600/20 text-amber-300" },
  red: { ring: "ring-red-500", icon: "bg-red-600/20 text-red-300" },
};

function statusBadgeClass(acc) {
  if (acc.isActive) return "bg-emerald-600/20 text-emerald-300";
  if (acc.isError) return "bg-red-600/20 text-red-300";
  return "bg-amber-600/20 text-amber-300";
}

// bot6.py "YYYY-MM-DD HH:MM:SS" formatında yazır — cədvəldə gün-ay-il kimi göstəririk
function formatDMY(raw) {
  if (!raw) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(String(raw).trim());
  if (!m) return raw;
  const [, y, mo, d, rest] = m;
  return `${d}.${mo}.${y}${rest}`;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, blocked: 0, error: 0 });
  const [statuses, setStatuses] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fileExists, setFileExists] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingKey, setEditingKey] = useState(null); // redaktə olunan sətrin KÖHNƏ emaili
  const [editData, setEditData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef(null);

  function startEdit(acc) {
    setEditingKey(acc.email);
    // Tarix sahələri XAM saxlanılır (formatDMY yox) ki, dəyişməyəndə Excel-də eyni qalsın
    setEditData({
      email: acc.email ?? "",
      status: acc.status ?? "",
      sonIstifade: acc.sonIstifade ?? "",
      blokVaxti: acc.blokVaxti ?? "",
    });
    setUploadError("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditData({});
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      await updateAccount(editingKey, editData);
      cancelEdit();
      await loadAccounts();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  const loadAccounts = useCallback(() => {
    setLoading(true);
    return getAccounts()
      .then((data) => {
        setAccounts(data.accounts);
        setSummary(data.summary);
        setStatuses(data.statuses || []);
        setFileExists(data.fileExists !== false);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const confirmed = window.confirm(
      "Mövcud accounts.xlsx faylı silinib yenisi ilə əvəz olunacaq. Davam edilsin?"
    );
    if (!confirmed) return;

    setUploading(true);
    setUploadError("");
    try {
      await uploadAccounts(file);
      await loadAccounts();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleStatusChange(email, newStatus) {
    try {
      await updateAccountStatus(email, newStatus);
      await loadAccounts();
    } catch (err) {
      setUploadError(err.message);
    }
  }

  async function handleAdd(account) {
    await addAccount(account);
    await loadAccounts();
  }

  async function handleDelete(email) {
    if (!window.confirm(`${email} silinsin? Excel-dəki sətir də silinəcək.`)) return;
    try {
      await deleteAccount(email);
      await loadAccounts();
    } catch (err) {
      setUploadError(err.message);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "active") return accounts.filter((a) => a.isActive);
    if (filter === "blocked") return accounts.filter((a) => a.isBlocked);
    if (filter === "error") return accounts.filter((a) => a.isError);
    return accounts;
  }, [accounts, filter]);

  const counts = {
    all: summary.total,
    active: summary.active,
    blocked: summary.blocked,
    error: summary.error,
  };

  return (
    <Layout title="Hesablar">
      <div className="flex h-full min-h-0 flex-col">
      <div className="mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">accounts.xlsx faylını idarə et</p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {uploadError && <span className="text-xs text-red-400 sm:text-sm">{uploadError}</span>}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            <FiPlus />
            Əlavə Et
          </button>
          {fileExists && (
            <a
              href="/api/accounts/download"
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {!loading && !error && !fileExists ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-[#161922] text-center">
          <p className="text-sm text-gray-300">Excel faylı tapılmadı</p>
          <p className="text-xs text-gray-500">Davam etmək üçün "Excel Yüklə" düyməsi ilə accounts.xlsx yüklə</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              {filtered.length} hesab göstərilir
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
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Email</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Status</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Son İstifadə</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Blok Vaxtı</th>
                      <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Əməliyyatlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((acc) => {
                      const isEditing = editingKey === acc.email;
                      const editCell = (field, w = "9rem") => (
                        <input
                          value={editData[field] ?? ""}
                          onChange={(e) => setEditData((d) => ({ ...d, [field]: e.target.value }))}
                          style={{ width: w }}
                          className="rounded border-0 bg-white/10 px-2 py-0.5 text-xs text-gray-100 outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      );
                      return (
                      <tr key={acc.email} className="border-t border-white/5 text-gray-300">
                        <td className="px-5 py-2">
                          {isEditing ? editCell("email", "14rem") : acc.email}
                        </td>
                        <td className="px-5 py-2">
                          {isEditing ? (
                            editCell("status", "8rem")
                          ) : (
                          <select
                            value={acc.status}
                            onChange={(e) => handleStatusChange(acc.email, e.target.value)}
                            className={`w-24 cursor-pointer truncate rounded border-0 px-2 py-0.5 text-xs ${statusBadgeClass(acc)}`}
                          >
                            {!statuses.includes(acc.status) && (
                              <option value={acc.status} className="bg-[#161922] text-gray-200">
                                {acc.status || "—"}
                              </option>
                            )}
                            {statuses.map((s) => (
                              <option key={s} value={s} className="bg-[#161922] text-gray-200">
                                {s}
                              </option>
                            ))}
                          </select>
                          )}
                        </td>
                        <td className="px-5 py-2 text-gray-500">
                          {isEditing ? editCell("sonIstifade") : formatDMY(acc.sonIstifade) || "—"}
                        </td>
                        <td className="px-5 py-2 text-gray-500">
                          {isEditing ? editCell("blokVaxti") : formatDMY(acc.blokVaxti) || "—"}
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
                                onClick={() => startEdit(acc)}
                                title="Redaktə et"
                                className="cursor-pointer text-violet-400 hover:text-violet-300"
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                onClick={() => handleDelete(acc.email)}
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

      {showAddModal && <AddAccountModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />}
    </Layout>
  );
}
