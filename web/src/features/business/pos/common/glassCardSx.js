/** Frosted-glass card style built from the palette `C` (buildColors). */
export const buildGlassCardSx = (C) => ({
  bgcolor: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: "16px",
  boxShadow: C.cardShadow,
});
