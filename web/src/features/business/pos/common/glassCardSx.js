/** Frosted-glass card style built from the palette `C` (buildColors). */
export const buildGlassCardSx = (C) => ({
  bgcolor: C.glass,
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  border: `1px solid ${C.glassBorder}`,
  borderRadius: "16px",
  boxShadow: C.cardShadow,
});
