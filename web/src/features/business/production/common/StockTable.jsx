import { Box, Chip, Button, Alert, Table, TableHead, TableBody, TableRow, TableCell } from "@mui/material";
import TableWrap from "./TableWrap";

const typeColor = (C, type) => ({
  raw: [C.info, C.infoBg],
  packaging: [C.muted, C.divider],
  semi_finished: [C.warning, C.warningBg],
  finished: [C.success, C.successBg],
}[type] || [C.muted, C.divider]);

export function TypeBadge({ t, C, type }) {
  if (!type) return null;
  const [fg, bg] = typeColor(C, type);
  return (
    <Chip size="small" label={t(`ui_prod.type_${type}`, { defaultValue: type })}
      sx={{ color: fg, bgcolor: bg, fontWeight: 700, height: 20, fontSize: 11 }} />
  );
}

const statusStyle = (C, s) => ({
  enough: [C.success, C.successBg, "✓"],
  low: [C.warning, C.warningBg, "!"],
  missing: [C.danger, C.dangerBg, "✕"],
}[s]);

/** Icon + text, so state never relies on colour alone. */
export function StatusCell({ t, C, status, label }) {
  const [fg, bg, icon] = statusStyle(C, status);
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, color: fg, fontWeight: 700, fontSize: 12 }}>
      <Box component="span" aria-hidden="true" sx={{
        width: 20, height: 20, borderRadius: "50%", bgcolor: bg, display: "inline-flex",
        alignItems: "center", justifyContent: "center", fontSize: 12,
      }}>{icon}</Box>
      {label ?? t(`ui_prod.status_${status}`)}
    </Box>
  );
}

export function SubFormulaButton({ t, C, name, onOpen }) {
  return (
    <Button size="small" onClick={onOpen} aria-label={t("ui_prod.has_formula_aria", { name })}
      sx={{ color: C.primary, textTransform: "none", fontSize: 12, p: 0, minWidth: 0, textDecoration: "underline" }}>
      {t("ui_prod.has_formula")}
    </Button>
  );
}

/** Banner above the table: ready / short count. */
export function ReadyBanner({ t, ready, count, okText, shortText }) {
  return (
    <Alert severity={ready ? "success" : "error"} role="status">
      {ready ? (okText || t("ui_prod.ready")) : (shortText || t("ui_prod.not_ready", { count }))}
    </Alert>
  );
}

const fmtN = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 });

/**
 * Required / in stock / missing per input. rows:
 * { key, material, type, unit, required, available, missing, subFormulaId }
 */
export function RequirementsTable({ ctx, rows, onOpenFormula }) {
  const { t, C, S } = ctx;
  return (
    <TableWrap C={C}>
      <Table size="small" sx={{ minWidth: 640 }} aria-label={t("ui_prod.table_aria")}>
        <TableHead>
          <TableRow>
            {["material", "required", "available", "missing", "status"].map((k) => (
              <TableCell key={k} sx={S.th}>{t(`ui_prod.col_${k}`)}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const st = r.missing > 0 ? (r.available > 0 ? "low" : "missing") : "enough";
            return (
              <TableRow key={r.key} sx={r.missing > 0 ? { bgcolor: C.dangerBg } : undefined}>
                <TableCell sx={{ ...S.td, fontWeight: r.missing > 0 ? 700 : 500 }}>
                  <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
                    <span>{r.material}</span>
                    <TypeBadge t={t} C={C} type={r.type} />
                  </Box>
                  {r.subFormulaId && onOpenFormula && (
                    <SubFormulaButton t={t} C={C} name={r.material} onOpen={() => onOpenFormula(r.subFormulaId)} />
                  )}
                </TableCell>
                <TableCell sx={S.td}>{fmtN(r.required)} {r.unit}</TableCell>
                <TableCell sx={S.td}>{fmtN(r.available)} {r.unit}</TableCell>
                <TableCell sx={{ ...S.td, color: r.missing > 0 ? C.danger : C.muted, fontWeight: r.missing > 0 ? 700 : 400 }}>
                  {r.missing > 0 ? `${fmtN(r.missing)} ${r.unit}` : "—"}
                </TableCell>
                <TableCell sx={S.td}>
                  <StatusCell t={t} C={C} status={st} label={st === "low" ? t("ui_prod.status_short") : undefined} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
