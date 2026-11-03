import { useEffect, useRef } from "react";

/**
 * میان‌برهای کیبورد — نسخه‌ی عمومی و قابل‌تنظیم.
 *
 * استفاده:
 *   useShortcuts([
 *     { combo: "F2",     label: "جدید",   handler: onNew },
 *     { combo: "Ctrl+D", label: "ذخیره",  handler: onSave },
 *     { combo: "Escape", label: "بستن",   handler: onClose, scope: "dialog" },
 *     { combo: "Alt+1",  label: "تب ۱",   handler: () => setTab(0) },
 *   ], { enabled: true });
 *
 * قراردادهای استاندارد برنامه (برای ثبات بین صفحه‌ها):
 *   F2 = جدید            F3 = جدید (دوم/واحد)      Ctrl+D = ثبت/ذخیره/تأیید
 *   Ctrl+A = بعدی        Ctrl+Z = قبلی             Enter = تأیید      Escape = بستن
 *   Alt+1…9 = تب‌ها      F1 = راهنمای میان‌برها
 *
 * نکات:
 *  - حروف و ارقام با `event.code` تطبیق داده می‌شوند، پس در کیبورد فارسی هم کار می‌کنند.
 *  - وقتی فوکوس داخل input/textarea/select است، فقط F-keyها، Escape و ترکیب‌های Ctrl/Alt
 *    فعال‌اند، مگر `allowInInput: true` باشد (مثلاً Enter در فیلد جستجو).
 *  - میان‌برهای `scope: "page"` (پیش‌فرض) وقتی یک Dialog باز است غیرفعال می‌شوند؛
 *    میان‌برهای `scope: "dialog"` فقط باید داخل کامپوننتی که Dialog باز است ثبت شوند.
 *  - اگر handler مقدار `false` برگرداند، preventDefault انجام نمی‌شود.
 */

const NAMED_KEYS = new Set([
  "Escape", "Enter", "Tab", "Backspace", "Delete", "Space",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

export function parseCombo(combo) {
  const parts = String(combo).split("+").map((p) => p.trim());
  const key = parts.pop();
  const mods = parts.map((p) => p.toLowerCase());
  const spec = {
    ctrl: mods.includes("ctrl") || mods.includes("cmd"),
    alt: mods.includes("alt"),
    shift: mods.includes("shift"),
    key,
    by: "key",
    code: null,
  };
  if (/^[A-Za-z]$/.test(key)) {
    spec.by = "code";
    spec.code = `Key${key.toUpperCase()}`;
  } else if (/^[0-9]$/.test(key)) {
    spec.by = "code";
    spec.code = `Digit${key}`;
  } else if (!/^F([1-9]|1[0-2])$/.test(key) && !NAMED_KEYS.has(key)) {
    spec.by = "key";
  }
  return spec;
}

function matches(spec, e) {
  if (spec.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (spec.alt !== e.altKey) return false;
  if (spec.shift !== e.shiftKey) return false;
  if (spec.by === "code") {
    // ارقام numpad هم قبول شوند
    return e.code === spec.code || e.code === spec.code.replace("Digit", "Numpad");
  }
  return e.key === spec.key;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function dialogIsOpen() {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(".MuiDialog-root, .MuiDrawer-modal");
}

export default function useShortcuts(bindings, { enabled = true } = {}) {
  const ref = useRef([]);

  // آخرین bindingها را بدون نوشتن در ref هنگام render نگه می‌داریم
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (e) => {
      if (e.defaultPrevented || e.isComposing) return;
      const typing = isTypingTarget(e.target);
      const modalOpen = dialogIsOpen();

      for (const b of ref.current) {
        if (!b || b.when === false) continue;
        const spec = b._spec || (b._spec = parseCombo(b.combo));
        if (!matches(spec, e)) continue;

        const scope = b.scope || "page";
        if (scope === "page" && modalOpen) continue;

        const safeInInput =
          b.allowInInput ||
          spec.ctrl ||
          spec.alt ||
          /^F\d+$/.test(spec.key) ||
          spec.key === "Escape";
        if (typing && !safeInInput) continue;

        const result = b.handler?.(e);
        if (result !== false) e.preventDefault();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}

/** متن نمایشی ترکیب برای راهنما (مثلاً "Ctrl + D"). */
export function formatCombo(combo) {
  return String(combo).split("+").map((p) => p.trim()).join(" + ");
}
