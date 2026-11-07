import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useLoad from "@business/support/useLoad";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { useLang } from "@shared/contexts/LangContext";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import {
  useStyles, TableWrap, useRowCursor, cursorBindings, cursorProps, fmtInt,
} from "@business/accounting/common";
import ThreadDialog from "@business/support/ThreadDialog";
import { STATUSES, CATEGORIES, errMsg, statusColor, fmtStamp } from "@business/support/common";
import { fetchSupportTickets, superThreadApi } from "./api";

/**
 * Platform support inbox (super admin).
 * Keys: F3 search, Ctrl+A / Ctrl+Z row cursor, Enter open, Ctrl+D send reply, Escape close.
 */
export default function SupportPanel({ C, tenants = [], onChanged }) {
  const { t } = useTranslation();
  const { isRtl, lang } = useLang();
  const S = useStyles(C);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [business, setBusiness] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const params = useMemo(() => {
    const p = { page };
    if (status) p.status = status;
    if (category) p.category = category;
    if (business) p.business = business;
    if (q) p.q = q;
    return p;
  }, [status, category, business, q, page]);
  const { data: loaded, error: loadErr, loading, reload: load } = useLoad(fetchSupportTickets, params);
  const data = loaded || { results: [], count: 0, pages: 1, page: 1 };
  const error = loadErr ? errMsg(loadErr, t("ui_sup.common.err_generic")) : "";
  const [openId, setOpenId] = useState(null);
  const searchRef = useRef(null);
  const firstRun = useRef(true);

  const businesses = useMemo(() => tenants.filter((x) => x.business_id), [tenants]);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const id = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [qInput]);

  const rows = data.results || [];
  const cursor = useRowCursor(rows.length);
  const ctx = { t, C, S, lang, isRtl, fullScreen };
  const changed = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);
  const filterChange = (setter) => (e) => { setter(e.target.value); setPage(1); cursor.reset(); };

  useRegisteredShortcuts([
    { combo: "F3", label: t("ui_sup.adm.focus_search"), handler: () => searchRef.current?.focus() },
    ...cursorBindings(t, cursor),
    {
      combo: "Enter", label: t("ui_sup.common.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setOpenId(r.id); return true; }),
    },
  ], { enabled: openId == null });

  const field = { ...S.field, minWidth: 150, flex: { xs: "1 1 140px", sm: "none" } };
  return (
    <Box dir={isRtl ? "rtl" : "ltr"}>
      <Box sx={S.card}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
          <TextField inputRef={searchRef} size="small" label={t("ui_sup.adm.search")} value={qInput}
            sx={{ ...S.field, flex: 1, minWidth: { xs: "100%", sm: 220 } }}
            onChange={(e) => { setQInput(e.target.value); cursor.reset(); }} />
          <TextField select size="small" label={t("ui_sup.common.status_l")} value={status} sx={field} onChange={filterChange(setStatus)}>
            <MenuItem value="">{t("ui_sup.common.all")}</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_sup.status.${s}`)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t("ui_sup.common.category")} value={category} sx={field} onChange={filterChange(setCategory)}>
            <MenuItem value="">{t("ui_sup.common.all")}</MenuItem>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{t(`ui_sup.cat.${c}`)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t("ui_sup.adm.business")} value={business} sx={field} onChange={filterChange(setBusiness)}>
            <MenuItem value="">{t("ui_sup.common.all")}</MenuItem>
            {businesses.map((b) => <MenuItem key={b.business_id} value={String(b.business_id)}>{b.business_name || b.name || b.business_id}</MenuItem>)}
          </TextField>
          <Button sx={S.ghost} variant="outlined" onClick={load}>{t("ui_sup.common.refresh")}</Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
        ) : rows.length === 0 ? (
          <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_sup.common.empty")}</Typography>
        ) : (
          <TableWrap C={C}>
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={S.th}>{t("ui_sup.adm.business")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.subject")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.category")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.status_l")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_sup.common.messages_n")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_sup.common.last_activity")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, i) => {
                  const cp = cursorProps(C, i === cursor.index);
                  return (
                    <TableRow key={r.id} hover onClick={() => setOpenId(r.id)} {...cp} sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                      <TableCell sx={{ ...S.td, fontWeight: 600 }}>{r.business?.name}</TableCell>
                      <TableCell sx={{ ...S.td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.priority === "high" && <Box component="span" sx={{ color: C.danger, fontWeight: 800, me: 0.5 }}>! </Box>}
                        {r.subject}
                      </TableCell>
                      <TableCell sx={S.td}>{t(`ui_sup.cat.${r.category}`)}</TableCell>
                      <TableCell sx={S.td}>
                        <Chip size="small" label={t(`ui_sup.status.${r.status}`)}
                          sx={{ color: statusColor(C, r.status), border: `1px solid ${statusColor(C, r.status)}`, bgcolor: "transparent", fontWeight: 700 }} />
                      </TableCell>
                      <TableCell sx={S.tdNum}>{fmtInt(r.message_count ?? 0, lang)}</TableCell>
                      <TableCell sx={S.td}>{fmtStamp(r.last_activity_at, lang)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrap>
        )}

        {data.pages > 1 && (
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", justifyContent: "center", mt: 1.5 }}>
            <Button sx={S.ghost} variant="outlined" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("ui_sup.adm.prev")}</Button>
            <Typography sx={{ color: C.sub, fontSize: 13 }}>
              {t("ui_sup.adm.page_n", { a: fmtInt(data.page, lang), b: fmtInt(data.pages, lang) })}
            </Typography>
            <Button sx={S.ghost} variant="outlined" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>{t("ui_sup.adm.next")}</Button>
          </Box>
        )}
      </Box>

      {openId != null && (
        <ThreadDialog ctx={ctx} id={openId} api={superThreadApi} admin onClose={() => setOpenId(null)} onChanged={changed} />
      )}
    </Box>
  );
}
