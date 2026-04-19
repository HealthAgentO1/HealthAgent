import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import SymptomCheckPage from "./pages/SymptomCheckPage";
import MedicationSafetyPage from "./pages/MedicationSafetyPage";
import MedicationSafetyDetailPage from "./pages/MedicationSafetyDetailPage";
import ReportsPage from "./pages/ReportsPage";
import EmergencyContactPage from "./pages/EmergencyContactPage";
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
          <Route path="/medication-safety" element={<MedicationSafetyPage />} />
          <Route path="/medication-safety/med/:medicationId" element={<MedicationSafetyDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/emergency" element={<EmergencyContactPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
