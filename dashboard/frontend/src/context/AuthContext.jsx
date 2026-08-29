import { createContext, useContext, useEffect, useState } from "react";
import * as api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(username, password) {
    const data = await api.login(username, password);
    setUser(data);
    return data;
  }

  async function signOut() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
