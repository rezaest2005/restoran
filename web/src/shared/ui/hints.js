/** مجموعه‌ی استاندارد میان‌برها برای صفحه‌های لیستی. */
export const standardHints = (t, extra = []) => [
  { keys: "F2", label: t("ui_design.hint_new") },
  { keys: "Ctrl+D", label: t("ui_design.hint_save") },
  ...extra,
  { keys: "Esc", label: t("ui_design.hint_close") },
  { keys: "F1", label: t("ui_design.hint_help") },
];
