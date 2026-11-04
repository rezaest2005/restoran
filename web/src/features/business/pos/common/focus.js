/* Move focus out of a dialog before it starts hiding, so MUI does not put
   aria-hidden on an element that still contains the focused control. */
export const blurFocused = () => {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (el && el !== document.body && typeof el.blur === "function") el.blur();
};
