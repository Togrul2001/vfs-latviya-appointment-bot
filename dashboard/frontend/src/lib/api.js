async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Sorğu uğursuz oldu");
  }
  return data;
}

export const login = (username, password) =>
  request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });

export const logout = () => request("/auth/logout", { method: "POST" });

export const me = () => request("/auth/me");

export const getAccounts = () => request("/accounts");

export const addAccount = (account) => request("/accounts", { method: "POST", body: JSON.stringify(account) });

export const updateAccountStatus = (email, status) =>
  request(`/accounts/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const updateAccount = (email, updates) =>
  request(`/accounts/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

export const deleteAccount = (email) =>
  request(`/accounts/${encodeURIComponent(email)}`, { method: "DELETE" });

export const getApplicants = () => request("/applicants");

export const addApplicant = (applicant) =>
  request("/applicants", { method: "POST", body: JSON.stringify(applicant) });

export const updateApplicant = (mail, updates) =>
  request(`/applicants/${encodeURIComponent(mail)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

export const deleteApplicant = (mail) =>
  request(`/applicants/${encodeURIComponent(mail)}`, { method: "DELETE" });

export async function uploadApplicants(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/applicants/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Yükləmə uğursuz oldu");
  return data;
}

export const getBotStatus = () => request("/bot/status");

export const startBot = () => request("/bot/start", { method: "POST" });

export const stopBot = () => request("/bot/stop", { method: "POST" });

export async function uploadAccounts(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/accounts/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Yükləmə uğursuz oldu");
  return data;
}

export const getProxies = () => request("/proxies");

export const addProxy = (proxy) => request("/proxies", { method: "POST", body: JSON.stringify(proxy) });

export const updateProxyStatus = (server, active) =>
  request(`/proxies/${encodeURIComponent(server)}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });

export const deleteProxy = (server) =>
  request(`/proxies/${encodeURIComponent(server)}`, { method: "DELETE" });

export async function uploadProxies(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/proxies/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Yükləmə uğursuz oldu");
  return data;
}

export const getVisaCategory = () => request("/settings/visa-category");

export const setVisaCategory = (visaCategory) =>
  request("/settings/visa-category", { method: "POST", body: JSON.stringify({ visaCategory }) });

export const getWindowStatus = () => request("/vnc/window-status");

export const nextWindow = () => request("/vnc/window/next", { method: "POST" });

export const prevWindow = () => request("/vnc/window/prev", { method: "POST" });

export const getTelegramStatus = () => request("/telegram/status");

export const linkTelegram = () => request("/telegram/link", { method: "POST" });

export const unlinkTelegram = () => request("/telegram/unlink", { method: "POST" });
