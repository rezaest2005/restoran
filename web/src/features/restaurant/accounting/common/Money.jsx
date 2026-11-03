import { Box } from "@mui/material";
import { fmtMoney } from "./format";

/** LTR amount; negative values use the danger color. `zeroDash` renders 0 as an em dash. */
export default function Money({ v, lang, C, zeroDash = false, bold = false, color }) {
  const n = Number(v);
  const empty = v == null || !Number.isFinite(n) || (zeroDash && Math.abs(n) < 0.005);
  return (
    <Box
      component="span" dir="ltr"
      sx={{
        display: "inline-block", fontWeight: bold ? 800 : "inherit",
        color: !empty && n < 0 ? C.danger : color || "inherit",
      }}
    >
      {empty ? "—" : fmtMoney(n, lang)}
    </Box>
  );
}
