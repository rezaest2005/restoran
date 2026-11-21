import { Box, Button } from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import { downloadCsv, downloadExcel } from "./download";

/**
 * Print / CSV / Excel buttons for a report. `getRows()` returns the table as an array of rows (first = header).
 * Alt+P print, Alt+E CSV, Alt+X Excel.
 */
export default function ReportActions({ ctx, getRows, filename, disabled }) {
  const { t, S, notify, isRtl } = ctx;
  const print = () => { try { window.print(); } catch { notify(t("ui_i.reports.print_failed"), "error"); } };
  const csv = () => { if (!downloadCsv(`${filename}.csv`, getRows())) notify(t("ui_i.reports.export_failed"), "error"); };
  const xls = () => {
    if (!downloadExcel(filename, getRows(), { sheet: filename, rtl: isRtl })) notify(t("ui_i.reports.export_failed"), "error");
  };
  useRegisteredShortcuts([
    { combo: "Alt+P", label: t("ui_i.reports.print"), handler: () => (disabled ? false : print()) },
    { combo: "Alt+E", label: t("ui_i.reports.export_csv"), handler: () => (disabled ? false : csv()) },
    { combo: "Alt+X", label: t("acc2.reports.export_excel"), handler: () => (disabled ? false : xls()) },
  ]);
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      <Button variant="outlined" sx={S.ghost} onClick={print} disabled={disabled}>{t("ui_i.reports.print")}</Button>
      <Button variant="outlined" sx={S.ghost} onClick={csv} disabled={disabled}>CSV</Button>
      <Button variant="outlined" sx={S.ghost} onClick={xls} disabled={disabled}>Excel</Button>
    </Box>
  );
}
