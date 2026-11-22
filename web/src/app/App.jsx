import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { ThemeProvider } from "@shared/contexts/ThemeContext";
import { LangProvider } from "@shared/contexts/LangContext";
import Login from "@business/auth/Login";
import ProtectedRoute from "@business/auth/ProtectedRoute";

// Only the sign-in page is in the first download; every other screen is fetched when its address is opened.
const SuperLogin = lazy(() => import("@super/auth/SuperLogin"));
const SuperAdmin = lazy(() => import("@super/layout/SuperAdminLayout"));
const SuperProtectedRoute = lazy(() => import("@super/auth/SuperProtectedRoute"));
const BusinessLayout = lazy(() => import("@business/layout/BusinessLayout"));
const Dashboard = lazy(() => import("@business/dashboard/dashboard"));
const Pos = lazy(() => import("@business/pos/Pos"));
const Dictionary = lazy(() => import("@business/dictionary/Dictionary"));
const InventoryPage = lazy(() => import("@business/inventory/InventoryPage"));
const ProductionPage = lazy(() => import("@business/production/ProductionPage"));
const DispatchPage = lazy(() => import("@business/delivery/DispatchPage"));
const ActivityPage = lazy(() => import("@business/activity/ActivityPage"));
const DriverPage = lazy(() => import("@business/delivery/DriverPage"));
const TrackingPage = lazy(() => import("@business/delivery/TrackingPage"));
const QrMenu = lazy(() => import("../features/public/QrMenu"));
const FeedbackPublicPage = lazy(() => import("../features/public/feedback/FeedbackPublicPage"));
const StorefrontPage = lazy(() => import("../features/public/storefront/StorefrontPage"));
const ClubPublicPage = lazy(() => import("../features/public/club/ClubPublicPage"));

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
        <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
        <Routes>
          <Route path="/" element={<StorefrontPage byHost />} />
          <Route path="/s/:slug" element={<StorefrontPage />} />
          <Route path="/f/:slug" element={<FeedbackPublicPage />} />
          <Route path="/club/:slug" element={<ClubPublicPage />} />
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
        </Suspense>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;