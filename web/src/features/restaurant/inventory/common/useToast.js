import { useState, useCallback } from "react";

/** Toast state: `{ toast, showToast(message, type), closeToast }`. */
export function useToast() {
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  const showToast = useCallback(
    (message, type = "info") => setToast({ open: true, message, type }),
    [],
  );
  const closeToast = useCallback(() => setToast((s) => ({ ...s, open: false })), []);
  return { toast, showToast, closeToast };
}
