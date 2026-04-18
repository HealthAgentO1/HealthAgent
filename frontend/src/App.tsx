import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import SymptomCheckPage from "./pages/SymptomCheckPage";
import CareMatchesPage from "./pages/CareMatchesPage";
import MedicationSafetyPage from "./pages/MedicationSafetyPage";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/symptom-check" element={<SymptomCheckPage />} />
        <Route path="/care-matches" element={<CareMatchesPage />} />
        <Route path="/medication-safety" element={<MedicationSafetyPage />} />
      </Route>
    </Routes>
  );
}

export default App;
