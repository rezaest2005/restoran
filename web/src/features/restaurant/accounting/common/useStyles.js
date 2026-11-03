import { useMemo } from "react";

/** Shared `sx` fragments for the accounting screens, derived from palette `C`. */
export default function useStyles(C) {
  return useMemo(() => ({
    card: {
      bgcolor: C.glass, backdropFilter: "blur(16px)",
      border: `1px solid ${C.glassBorder}`, borderRadius: 3,
      boxShadow: C.cardShadow, p: { xs: 1.5, sm: 2.5 },
    },
    btn: {
      background: C.btnGrad, color: C.onPrimary, fontWeight: 700,
      borderRadius: 2, textTransform: "none", px: 2.5, minHeight: 40,
      "&:hover": { background: C.btnGrad, opacity: 0.92 },
      "&.Mui-disabled": { opacity: 0.5, color: C.onPrimary },
    },
    ghost: {
      color: C.sub, borderColor: C.glassBorder, borderRadius: 2,
      textTransform: "none", minHeight: 40,
    },
    link: { color: C.primary, textTransform: "none", minHeight: 40, minWidth: 40 },
    th: {
      color: C.sub, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
      borderColor: C.divider, textAlign: "start", bgcolor: C.tableHeaderBg,
    },
    thNum: {
      color: C.sub, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
      borderColor: C.divider, textAlign: "end", bgcolor: C.tableHeaderBg,
    },
    td: { color: C.text, fontSize: 13, borderColor: C.divider, textAlign: "start" },
    tdNum: {
      color: C.text, fontSize: 13, borderColor: C.divider, textAlign: "end",
      whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
    },
    field: {
      "& .MuiInputBase-root": { bgcolor: C.inputBg, color: C.text, borderRadius: 2, minHeight: 40 },
      "& .MuiInputLabel-root": { color: C.sub },
      "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder },
    },
    dialogPaper: {
      bgcolor: C.surface, color: C.text, backgroundImage: "none",
      border: `1px solid ${C.glassBorder}`, borderRadius: { xs: 0, sm: 3 },
    },
  }), [C]);
}
