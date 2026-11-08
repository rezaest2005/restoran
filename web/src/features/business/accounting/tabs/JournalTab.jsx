import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box, Typography, Button, Chip, Table, TableHead, TableBody, TableRow, TableCell, TextField,
  Alert, CircularProgress, Pagination,
} from "@mui/material";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import {
  TableWrap, Money, SOURCE_TYPES, fmtDate, fmtInt, useRowCursor, cursorBindings, cursorProps,
} from "../common";
import { fetchJournal, errMsg } from "../api";
import { SourceBadge } from "./EntryDetailDialog";

export default function JournalTab(ctx) {
  const { t, C, S, lang, refreshKey, openDetail, openNewEntry } = ctx;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ total: 0, page: 1, page_size: 25, results: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const firstRun = useRef(true);

  // debounce the search box
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const id = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [qInput]);

  const load = useCallback(() => {
    setLoading(true);
    fetchJournal({ from, to, q, source_type: source, page })
      .then((d) => { setData(d || { total: 0, results: [] }); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [from, to, q, source, page, t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const rows = data.results || [];
  const pageSize = data.page_size || 25;
  const pages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
  const cursor = useRowCursor(rows.length);

  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_i.keys.new_entry"), handler: openNewEntry },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_i.keys.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; openDetail(r.id); return true; }) },
  ]);

  const setFilter = (fn) => (e) => { fn(e.target.value); setPage(1); cursor.reset(); };

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
        <TextField type="date" slotProps={{ inputLabel: { shrink: true } }} size="small" label={t("ui_i.common.from")} value={from} sx={{ ...S.field, width: { xs: "calc(50% - 6px)", sm: 160 } }}
          onChange={setFilter(setFrom)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" slotProps={{ inputLabel: { shrink: true } }} size="small" label={t("ui_i.common.to")} value={to} sx={{ ...S.field, width: { xs: "calc(50% - 6px)", sm: 160 } }}
          onChange={setFilter(setTo)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" label={t("ui_i.common.search")} value={qInput} sx={{ ...S.field, flex: 1, minWidth: { xs: "100%", sm: 200 } }}
          onChange={(e) => setQInput(e.target.value)} />
        <Button sx={S.btn} onClick={openNewEntry}>{t("ui_i.entry.new")}<KbdHint>F2</KbdHint></Button>
      </Box>

      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 2 }}>
        {["", ...SOURCE_TYPES].map((s) => {
          const on = source === s;
          return (
            <Chip key={s || "all"} clickable onClick={() => { setSource(s); setPage(1); cursor.reset(); }}
              label={s ? t(`ui_i.src.${s}`) : t("ui_i.common.all")}
              sx={{
                height: 36, fontWeight: 600,
                bgcolor: on ? C.primary : "transparent", color: on ? C.onPrimary : C.sub,
                border: `1px solid ${on ? C.primary : C.glassBorder}`,
                "&:hover": { bgcolor: on ? C.primary : C.primarySubtle },
              }} />
          );
        })}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_i.journal.empty")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("ui_i.common.number")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.date")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.description")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.source")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_i.common.amount")}</TableCell>
                <TableCell sx={S.th} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e, i) => {
                const cp = cursorProps(C, i === cursor.index);
                return (
                  <TableRow key={e.id} hover onClick={() => openDetail(e.id)} {...cp}
                    sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                    <TableCell sx={{ ...S.td, fontWeight: 600 }}>{fmtInt(e.number, lang)}</TableCell>
                    <TableCell sx={S.td}>{fmtDate(e.date, lang)}</TableCell>
                    <TableCell sx={S.td}>{e.description || "—"}</TableCell>
                    <TableCell sx={S.td}>
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5 }}>
                        <SourceBadge entry={e} ctx={ctx} />
                        {e.reversal_of && (
                          <Button size="small" sx={{ ...S.link, minHeight: 28, fontSize: 12, p: 0 }}
                            onClick={(ev) => { ev.stopPropagation(); openDetail(e.reversal_of); }}>
                            {t("ui_i.entry.reversal_of", { id: fmtInt(e.reversal_of, lang) })}
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={S.tdNum}><Money v={e.total} lang={lang} C={C} /></TableCell>
                    <TableCell sx={S.td}>
                      <Button size="small" sx={S.link} onClick={(ev) => { ev.stopPropagation(); openDetail(e.id); }}>
                        {t("ui_i.entry.details")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {pages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Pagination count={pages} page={page} onChange={(_, p) => { setPage(p); cursor.reset(); }}
            siblingCount={0} color="primary" />
        </Box>
      )}
    </Box>
  );
}
