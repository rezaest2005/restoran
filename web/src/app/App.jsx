import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { ThemeProvider } from "@shared/contexts/ThemeContext";
import { LangProvider } from "@shared/contexts/LangContext";
import Login from "@business/auth/Login";
import SuperLogin from "@super/auth/SuperLogin";
import SuperAdmin from "@super/layout/SuperAdminLayout";
import SuperProtectedRoute from "@super/auth/SuperProtectedRoute";
import ProtectedRoute from "@business/auth/ProtectedRoute";
import BusinessLayout from "@business/layout/BusinessLayout";
import Dashboard from "@business/dashboard/dashboard";
import Pos from "@business/pos/Pos";
import Dictionary from "@business/dictionary/Dictionary";
import InventoryPage from "@business/inventory/InventoryPage";
import ProductionPage from "@business/production/ProductionPage";
import DispatchPage from "@business/delivery/DispatchPage";
import ActivityPage from "@business/activity/ActivityPage";
import DriverPage from "@business/delivery/DriverPage";
import TrackingPage from "@business/delivery/TrackingPage";
import QrMenu from "../features/public/QrMenu";
import FeedbackPublicPage from "../features/public/feedback/FeedbackPublicPage";
import StorefrontPage from "../features/public/storefront/StorefrontPage";

/** /bizsuite_dashboard/app/... -> /<slug>/bizsuite_dashboard/app/... using the signed-in user's business. */
function ToSlug() {
  const loc = useLocation();
  let slug = "";
  try { slug = JSON.parse(sessionStorage.getItem("user") || "{}").business_slug || ""; } catch { /* ignore */ }
  if (!slug) return <Navigate to="/bizsuite_dashboard/login" replace />;
  return <Navigate to={`/${slug}${loc.pathname}${loc.search}`} replace />;
}

function SlugEntry() {
  const { slug } = useParams();
  return <Navigate to={`/${slug}/bizsuite_dashboard/login`} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Routes>
          <Route path="/" element={<StorefrontPage byHost />} />
          <Route path="/s/:slug" element={<StorefrontPage />} />
          <Route path="/f/:slug" element={<FeedbackPublicPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/:slug/bizsuite_dashboard/login" element={<Login />} />
          <Route path="/bizsuite_dashboard/login" element={<Login />} />

          <Route
            path="/bizsuite_dashboard"
            element={<Navigate to="/bizsuite_dashboard/login" replace />}
          />

          {/* با slug */}
          <Route
            path="/:slug/bizsuite_dashboard/app"
            element={
              <ProtectedRoute>
                <BusinessLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pos" element={<Pos />} />
            <Route path="dictionary" element={<Dictionary />} />
            <Route path="users" element={<Navigate to="../dictionary?tab=users" replace />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="accounting" element={<Navigate to="../dashboard?tab=accounting" replace />} />
            <Route path="delivery" element={<DispatchPage />} />
            <Route path="activity" element={<ActivityPage />} />
          </Route>

          {/* بدون slug: بعد از ورود به آدرس با slug می‌رود */}
          <Route path="/bizsuite_dashboard/app/*" element={<ProtectedRoute><ToSlug /></ProtectedRoute>} />

          <Route path="/bizsuite_admin/login" element={<SuperLogin />} />
          <Route
            path="/bizsuite_admin"
            element={
              <SuperProtectedRoute>
                <Navigate to="/bizsuite_admin/app" replace />
              </SuperProtectedRoute>
            }
          />
          <Route
            path="/bizsuite_admin/app"
            element={
              <SuperProtectedRoute>
                <SuperAdmin />
              </SuperProtectedRoute>
            }
          />
          <Route path="/super/login" element={<Navigate to="/bizsuite_admin/login" replace />} />
          <Route path="/super" element={<Navigate to="/bizsuite_admin" replace />} />
          <Route path="/super/app" element={<Navigate to="/bizsuite_admin/app" replace />} />

          <Route path="/m/:slug" element={<QrMenu />} />
          <Route path="/t/:token" element={<TrackingPage />} />
          <Route path="/bizsuite_driver" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
          <Route path="/:slug/bizsuite_driver" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
          {/* each courier has a numbered address: /<slug>/bizsuite_driver/1, /<slug>/bizsuite_driver/2 ... */}
          <Route path="/:slug/bizsuite_driver/:number" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
          {/* https://domain/<slug> opens that business's sign-in */}
          <Route path="/:slug" element={<SlugEntry />} />

          <Route path="*" element={<Navigate to="/bizsuite_dashboard" replace />} />
        </Routes>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;