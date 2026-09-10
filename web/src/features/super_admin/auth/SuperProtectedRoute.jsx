import { Navigate, useLocation } from "react-router-dom";

export default function SuperProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("super_token");

  // اگه توکن نبود، کاربر رو بفرست به صفحه لاگین
  if (!token) {
    // ذخیره مسیر فعلی برای اینکه بعد از لاگین برگردیم همونجا (اختیاری)
    return <Navigate to="/super/login" state={{ from: location }} replace />;
  }

  // اگه توکن بود، صفحه مورد نظر رو نشون بده
  return children;
}