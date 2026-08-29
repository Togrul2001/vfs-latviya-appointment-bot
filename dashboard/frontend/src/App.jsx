import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import Accounts from "./pages/Accounts";
import Applicants from "./pages/Applicants";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Proxies from "./pages/Proxies";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute>
              <Accounts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants"
          element={
            <ProtectedRoute>
              <Applicants />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proxies"
          element={
            <ProtectedRoute>
              <Proxies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
