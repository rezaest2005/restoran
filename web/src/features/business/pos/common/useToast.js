import { useCallback, useState } from "react";

/** Snackbar state: { toast, showToast(message, type), closeToast }. */
export default function useToast() {
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  const showToast = useCallback(
    (message, type = "info") => setToast({ open: true, message, type }),
    [],
  );
  const closeToast = useCallback(() => setToast((s) => ({ ...s, open: false })), []);
  return { toast, showToast, closeToast };
}
