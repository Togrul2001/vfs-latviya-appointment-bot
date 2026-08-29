import { useCallback, useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiClock, FiDownload, FiPlus, FiServer, FiTrash2, FiUpload, FiXCircle } from "react-icons/fi";
import AddProxyModal from "../components/AddProxyModal";
import Layout from "../components/Layout";
import TruncateCell from "../components/TruncateCell";
import { addProxy, deleteProxy, getProxies, updateProxyStatus, uploadProxies } from "../lib/api";

export default function Proxies() {
  const [proxies, setProxies] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, blocked: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fileExists, setFileExists] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    return getProxies()
      .then((data) => {
        setProxies(data.proxies);
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

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Mövcud proxy.xlsx faylı silinib yenisi ilə əvəz olunacaq. Davam edilsin?")) return;

    setUploading(true);
    setActionError("");
    try {
      await uploadProxies(file);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleToggle(proxy) {
    try {
      await updateProxyStatus(proxy.server, !proxy.active);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleAdd(proxy) {
    await addProxy(proxy);
    await load();
  }

  async function handleDelete(server) {
    if (!window.confirm(`${server} silinsin? Excel-dəki sətir də silinəcək.`)) return;
    try {
      await deleteProxy(server);
      await load();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const filtered =
    filter === "active"
      ? proxies.filter((p) => p.active)
      : filter === "inactive"
        ? proxies.filter((p) => !p.active)
        : filter === "blocked"
          ? proxies.filter((p) => p.isBlocked)
          : proxies;

  return (
    <Layout title="Proxy-lər">
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-400">proxy.xlsx faylını idarə et</p>
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
                href="/api/proxies/download"
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
            <div className="mb-6 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: "all", label: "Hamısı", icon: FiServer, count: summary.total, accent: "violet" },
                { key: "active", label: "Aktiv", icon: FiCheckCircle, count: summary.active, accent: "green" },
                { key: "inactive", label: "Deaktiv", icon: FiXCircle, count: summary.inactive, accent: "amber" },
                { key: "blocked", label: "Bloklanmış", icon: FiClock, count: summary.blocked, accent: "red" },
              ].map(({ key, label, icon: Icon, count, accent }) => {
                const selected = filter === key;
                const accents = {
                  violet: { ring: "ring-violet-500", icon: "bg-violet-600/20 text-violet-300" },
                  green: { ring: "ring-emerald-500", icon: "bg-emerald-600/20 text-emerald-300" },
                  amber: { ring: "ring-amber-500", icon: "bg-amber-600/20 text-amber-300" },
                  red: { ring: "ring-red-500", icon: "bg-red-600/20 text-red-300" },
                };
                const { ring, icon } = accents[accent];
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
                    <div className="text-2xl font-semibold text-white">{count}</div>
                    <div className="text-sm text-gray-400">{label}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex min-h-[320px] flex-1 flex-col rounded-xl border border-white/10 bg-[#161922]">
              <div className="shrink-0 border-b border-white/10 px-5 py-3 text-sm font-medium text-gray-300">
                {filtered.length} proxy göstərilir
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
                        <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Server</th>
                        <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">İstifadəçi adı</th>
                        <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Şifrə</th>
                        <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Status</th>
                        <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Blok Vaxtı</th>
                        <th className="sticky top-0 z-10 bg-[#1c202b] px-5 py-2 font-normal">Əməliyyatlar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.server} className="border-t border-white/5 text-gray-300">
                          <td className="px-5 py-2">
                            <TruncateCell value={p.server} maxWidth="12rem" />
                          </td>
                          <td className="px-5 py-2 text-gray-500">
                            <TruncateCell value={p.username} maxWidth="8rem" />
                          </td>
                          <td className="px-5 py-2 text-gray-500">
                            <TruncateCell value={p.password} maxWidth="8rem" />
                          </td>
                          <td className="px-5 py-2">
                            <button
                              onClick={() => handleToggle(p)}
                              className={`cursor-pointer rounded px-2 py-0.5 text-xs ${
                                p.active
                                  ? "bg-emerald-600/20 text-emerald-300"
                                  : "bg-red-600/20 text-red-300"
                              }`}
                            >
                              {p.active ? "Aktiv" : "Deaktiv"}
                            </button>
                          </td>
                          <td className="px-5 py-2 text-gray-500">
                            {p.isBlocked ? (
                              <span className="rounded bg-red-600/20 px-2 py-0.5 text-xs text-red-300">
                                {p.blockedRemaining}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-5 py-2">
                            <button
                              onClick={() => handleDelete(p.server)}
                              title="Sil"
                              className="cursor-pointer text-red-400 hover:text-red-300"
                            >
                              <FiTrash2 />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAddModal && <AddProxyModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />}
    </Layout>
  );
}
