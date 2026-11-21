/**
 * Small sx fragments for responsive layouts. Spread them into an sx object:
 *   <Box sx={{ ...rsx.formGrid(2), mb: 2 }}>   two columns from 600px, one column on phones
 *   <Box sx={rsx.toolbar}>                     filters/buttons that wrap instead of overflowing
 *   <IconButton sx={rsx.touch}>                at least 40×40 px
 *   <Typography sx={rsx.wrapText}>             long Persian / URL text breaks instead of widening the page
 */

/** grid with one column on phones and `cols` equal columns from breakpoint `from` (default sm). */
export const formGrid = (cols = 2, from = "sm", gap = 2) => ({
  display: "grid",
  gap,
  gridTemplateColumns: { xs: "minmax(0, 1fr)", [from]: `repeat(${cols}, minmax(0, 1fr))` },
});

/** auto-fitting card grid: as many `min`-px columns as fit, never wider than the screen. */
export const autoGrid = (min = 240, gap = 2) => ({
  display: "grid",
  gap,
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
});

/** a row of filters / actions that wraps; on phones each control takes the full row. */
export const toolbar = {
  display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center",
  "& > *": { flex: { xs: "1 1 100%", sm: "0 1 auto" }, minWidth: 0 },
};

/** a row that wraps but keeps natural widths (buttons in a header). */
export const wrapRow = { display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", minWidth: 0 };

/** minimum touch target. */
export const touch = { minWidth: 40, minHeight: 40 };

/** long words / URLs / Persian strings wrap instead of overflowing. */
export const wrapText = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 };

/** a field that is full width on phones and `w` wide from sm up. */
export const fieldWidth = (w) => ({ width: { xs: "100%", sm: w }, maxWidth: "100%" });

const rsx = { formGrid, autoGrid, toolbar, wrapRow, touch, wrapText, fieldWidth };
export default rsx;
