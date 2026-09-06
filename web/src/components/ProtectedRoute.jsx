import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  // فرض میکنیم توکن رستوران با این نام در localStorage ذخیره میشه
  const token = localStorage.getItem("access_token");

  if (!token) {
    // اگه توکن نبود، بفرست به صفحه لاگین رستوران
    return <Navigate to="/dashboard/login" state={{ from: location }} replace />;
  }

  return children;
}