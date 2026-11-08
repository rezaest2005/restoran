import { useTranslation } from "react-i18next";

/**
 * نوار میان‌بر پایین صفحه (۴ تا ۶ مورد).
 * items: [{ keys: "F2", label: "..." }]
 */
export default function HintBar({ items = [] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div className="ks-hintbar" role="note" aria-label={t("ui_design.hint_bar")}>
      {items.slice(0, 6).map((it) => (
        <span key={it.keys + it.label} className="ks-hint-item">
          <kbd dir="ltr">{it.keys}</kbd>
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

/** مجموعه‌ی استاندارد میان‌برها برای صفحه‌های لیستی. */
export const standardHints = (t, extra = []) => [
  { keys: "F2", label: t("ui_design.hint_new") },
  { keys: "Ctrl+D", label: t("ui_design.hint_save") },
  ...extra,
  { keys: "Esc", label: t("ui_design.hint_close") },
  { keys: "F1", label: t("ui_design.hint_help") },
];
