import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell,
} from "@mui/material";
import KbdHint from "@restaurant/pos/common/KbdHint";
import { TableWrap, Money, fmtDate, fmtInt } from "../common";
import { fetchSummary, fetchJournal, errMsg } from "../api";
import { SourceBadge } from "./EntryDetailDialog";

const KPIS = ["cash", "bank", "receivable", "payable", "inventory", "month_income", "month_expense", "month_profit"];

export default function OverviewTab(ctx) {
  const { t, C, S, lang, refreshKey, openDetail, openNewEntry } = ctx;
  const [sum, setSum] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchSummary(), fetchJournal({ page: 1 })])
      .then(([s, j]) => {
        if (!alive) return;
        setSum(s);
        setRecent((j?.results || []).slice(0, 8));
        setError("");
      })
      .catch((e) => alive && setError(errMsg(e, t("ui_i.common.load_failed"))))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshKey, t]);

  if (loading) return <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress size={28} /></Box>;

  const balanced = sum?.balanced;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {sum && (
        <>
          <Box sx={{
            ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 1.5, flexWrap: "wrap",
            borderColor: balanced ? C.success : C.danger,
          }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{
                width: 12, height: 12, borderRadius: "50%", bgcolor: balanced ? C.success : C.danger, flexShrink: 0,
              }} />
              <Box>
                <Typography sx={{ color: balanced ? C.success : C.danger, fontWeight: 800 }}>
                  {balanced ? t("ui_i.overview.balanced") : t("ui_i.overview.not_balanced")}
                </Typography>
                <Typography sx={{ color: C.sub, fontSize: 12 }}>
                  {balanced ? t("ui_i.overview.balanced_hint") : t("ui_i.overview.not_balanced_hint")}
                </Typography>
              </Box>
            </Box>
            <Button sx={S.btn} onClick={openNewEntry}>{t("ui_i.entry.new")}<KbdHint>F2</KbdHint></Button>
          </Box>

          <Box sx={{
            display: "grid", gap: 1.5,
            gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
          }}>
            {KPIS.map((k) => (
              <Box key={k} sx={{ ...S.card, p: { xs: 1.5, sm: 2 } }}>
                <Typography sx={{ color: C.sub, fontSize: 12, mb: 0.5 }}>{t(`ui_i.overview.kpi_${k}`)}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 800, fontSize: { xs: 16, sm: 20 } }}>
                  <Money v={sum[k]} lang={lang} C={C} />
                </Typography>
              </Box>
            ))}
          </Box>
          {Number(sum.driver_cash) !== 0 && sum.driver_cash != null && (
            <Typography sx={{ color: C.sub, fontSize: 12 }}>
              {t("ui_i.overview.kpi_driver_cash")}: <Money v={sum.driver_cash} lang={lang} C={C} />
            </Typography>
          )}
        </>
      )}

      <Box sx={S.card}>
        <Typography sx={{ color: C.text, fontWeight: 700, mb: 1.5 }}>{t("ui_i.overview.recent")}</Typography>
        {recent.length === 0 ? (
          <Typography sx={{ color: C.muted, textAlign: "center", py: 3 }}>{t("ui_i.journal.empty")}</Typography>
        ) : (
          <TableWrap C={C}>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={S.th}>{t("ui_i.common.number")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.date")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.description")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.source")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_i.common.amount")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recent.map((e) => (
                  <TableRow key={e.id} hover onClick={() => openDetail(e.id)} sx={{ cursor: "pointer" }}>
                    <TableCell sx={{ ...S.td, fontWeight: 600 }}>{fmtInt(e.number, lang)}</TableCell>
                    <TableCell sx={S.td}>{fmtDate(e.date, lang)}</TableCell>
                    <TableCell sx={S.td}>{e.description || "—"}</TableCell>
                    <TableCell sx={S.td}><SourceBadge entry={e} ctx={ctx} /></TableCell>
                    <TableCell sx={S.tdNum}><Money v={e.total} lang={lang} C={C} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Box>
    </Box>
  );
}
