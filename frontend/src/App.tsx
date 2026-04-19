import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import SymptomCheckPage from "./pages/SymptomCheckPage";
import CareMatchesPage from "./pages/CareMatchesPage";
import MedicationSafetyPage from "./pages/MedicationSafetyPage";
import ReportsPage from "./pages/ReportsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/symptom-check" element={<SymptomCheckPage />} />
          <Route path="/care-matches" element={<CareMatchesPage />} />
          <Route path="/medication-safety" element={<MedicationSafetyPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
