import { useEffect, useRef } from "react";

// ── میان‌برهای کیبورد — مشترک (فارسی + انگلیسی) ──
// e.code = موقعیت فیزیکی کلید → زبان فرقی نمیکنه
const isCtrl = (e, code) => e.ctrlKey && !e.altKey && e.code === code;

export default function useGlobalShortcuts({
  showForm = true,
  showUnitInput = false,
  onNew,        // F2
  onNewUnit,    // F3
  onAdd,        // Ctrl+D
  onNext,       // Ctrl+A
  onPrev,       // Ctrl+Z
  onEnter,      // Enter
  onClose,      // Escape
  onAddUnit,    // Enter در فیلد واحد جدید
}) {
  const ref = useRef({});
  ref.current = { showForm, showUnitInput, onNew, onNewUnit, onAdd, onNext, onPrev, onEnter, onClose, onAddUnit };

  useEffect(() => {
    const handler = (e) => {
      const s = ref.current;

      if (e.key === "F2") {
        e.preventDefault();
        s.onNew?.();
        return;
      }

      if (e.key === "F3") {
        e.preventDefault();
        s.onNewUnit?.();
        return;
      }

      if (isCtrl(e, "KeyD") && s.showForm) {
        e.preventDefault();
        s.onAdd?.();
        return;
      }

      if (isCtrl(e, "KeyA") && s.showForm && !s.showUnitInput) {
        e.preventDefault();
        s.onNext?.();
        return;
      }

      if (isCtrl(e, "KeyZ") && s.showForm && !s.showUnitInput) {
        e.preventDefault();
        s.onPrev?.();
        return;
      }

      if (e.key === "Enter" && !e.ctrlKey && !e.altKey && s.showForm) {
        if (s.showUnitInput) {
          e.preventDefault();
          s.onAddUnit?.();
          return;
        }
        s.onEnter?.(e);
        return;
      }

      if (e.key === "Escape" && s.showForm) {
        e.preventDefault();
        if (s.showUnitInput) {
          s.onAddUnit?.("__close__");
        } else {
          s.onClose?.();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}