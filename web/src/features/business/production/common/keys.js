/**
 * True when a plain Enter keypress should keep its native behaviour
 * (buttons, multiline text, MUI select/combobox) instead of confirming a dialog.
 */
export const enterIsNative = (e) => {
  const el = e?.target;
  if (!el) return false;
  return (
    el.tagName === "BUTTON" || el.tagName === "TEXTAREA" || el.tagName === "A" || el.tagName === "LI" ||
    ["combobox", "button", "option", "menuitem", "listbox"].includes(el.getAttribute?.("role"))
  );
};
