import { useMemo, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, Box, GlobalStyles } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import useShortcuts from "@shared/common/useShortcuts";
import KbdHint from "@restaurant/pos/common/KbdHint";

/** Props: { open: boolean, onClose: () => void, slug: string } */
export default function TableQrDialog({ open, onClose, slug }) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState("10");
  const n = Math.min(100, Math.max(1, parseInt(raw, 10) || 1));
  const tables = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n]);
  useShortcuts([
    { combo: "Ctrl+D", label: t("ui_d.table_qr.print"), scope: "dialog", handler: () => window.print() },
  ], { enabled: open });
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <GlobalStyles styles={{
        "@media print": {
          "body *": { visibility: "hidden" },
          "#table-qr-print, #table-qr-print *": { visibility: "visible" },
          "#table-qr-print": { position: "absolute", left: 0, top: 0, width: "100%" },
          ".MuiDialog-paper": { boxShadow: "none !important" },
        },
      }} />
      <DialogTitle>{t("ui_d.table_qr.title")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>{t("ui_d.table_qr.hint")}</Typography>
        <TextField
          type="number" size="small" label={t("ui_d.table_qr.count_label")} value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => setRaw(String(n))}
          inputProps={{ min: 1, max: 100 }} sx={{ mb: 2, width: 200 }}
        />
        <Box id="table-qr-print" sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 2 }}>
          {tables.map((i) => (
            <Box key={i} sx={{ textAlign: "center", p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, breakInside: "avoid", bgcolor: "#fff", color: "#000" }}>
              <QRCodeSVG
                value={`${origin}/m/${encodeURIComponent(slug)}?table=${i}`}
                size={128} level="M" marginSize={1}
                role="img" aria-label={t("ui_d.table_qr.qr_aria", { n: i })}
                style={{ width: "100%", height: "auto" }}
              />
              <Typography sx={{ fontWeight: 700, mt: 0.5 }}>{t("ui_d.table_qr.table_n", { n: i })}</Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("ui_d.table_qr.close")}</Button>
        <Button variant="contained" onClick={() => window.print()}>{t("ui_d.table_qr.print")}<KbdHint>Ctrl+D</KbdHint></Button>
      </DialogActions>
    </Dialog>
  );
}
