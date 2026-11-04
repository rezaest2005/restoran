import { useCallback } from "react";

/** Locale-aware number formatter for dashboard figures ("—" for null/undefined). */
export default function useNumberFormat(isRtl) {
  return useCallback((n) => {
    if (n == null) return "—";
    return isRtl ? Number(n).toLocaleString("fa-IR") : Number(n).toLocaleString("en-US");
  }, [isRtl]);
}
