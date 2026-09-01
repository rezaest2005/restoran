import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pos from "./pages/Pos";
import Kitchen from "./pages/Kitchen";
import AdminLayout from "./components/AdminLayout";

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pos" element={<Pos />} />
            <Route path="/kitchen" element={<Kitchen />} />
            <Route path="/orders" element={<div style={{padding:40}}>Orders — به‌زودی</div>} />
            <Route path="/recipes" element={<div style={{padding:40}}>Recipes — به‌زودی</div>} />
            <Route path="/raw-materials" element={<div style={{padding:40}}>Raw Materials — به‌زودی</div>} />
            <Route path="/ready-materials" element={<div style={{padding:40}}>Ready Materials — به‌زودی</div>} />
            <Route path="/invoices" element={<div style={{padding:40}}>Invoices — به‌زودی</div>} />
            <Route path="/usage-log" element={<div style={{padding:40}}>Usage Log — به‌زودی</div>} />
            <Route path="/dictionary" element={<div style={{padding:40}}>Dictionary — به‌زودی</div>} />
            <Route path="/users" element={<div style={{padding:40}}>Users — به‌زودی</div>} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;