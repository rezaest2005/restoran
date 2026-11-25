import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import { TableWrap, fmtInt, fmtDate, useRowCursor, cursorBindings, cursorProps, downloadCsv } from "../accounting/common";
import { fetchMembers, crud, errMsg } from "./api";
import TierBadge from "./TierBadge";
import MemberDialog from "./MemberDialog";
import MemberDetailDialog from "./MemberDetailDialog";

const SEGMENTS = ["new", "loyal", "regular", "at_risk", "lost"];
const SORTS = ["joined", "points", "spent", "recent", "visits"];

/**
 * Members table with segment / tier filters and sorting.
 * Keys: F2 new member, F3 search, Ctrl+A / Ctrl+Z row cursor, Enter open row.
 */
export default function MembersPanel({ ctx, segment, setSegment, active }) {
  const { t, C, S, lang, notify } = ctx;
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState("joined");
  const [tiers, setTiers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const firstRun = useRef(true);
  const searchRef = useRef(null);

  useEffect(() => { crud("tiers").list().then((d) => setTiers(Array.isArray(d) ? d : [])).catch(() => {}); }, []);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const id = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(id);
  }, [qInput]);

  const key = `${q}|${segment}|${tier}|${sort}`;
  const loading = loadedKey !== key;
  const load = useCallback(() => {
    fetchMembers({ q, segment, tier, sort: sort === "joined" ? "" : sort })
      .then((d) => { setRows(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_club.err.generic"))))
      .finally(() => setLoadedKey(`${q}|${segment}|${tier}|${sort}`));
  }, [q, segment, tier, sort, t]);
  useEffect(() => { load(); }, [load]);

  const cursor = useRowCursor(rows.length);
  useRegisteredShortcuts(active ? [
    { combo: "F2", label: t("ui_club.member.new"), handler: () => setAdding(true) },
    { combo: "F3", label: t("ui_club.search"), handler: () => searchRef.current?.focus() },
    ...cursorBindings(t, cursor),
    {
      combo: "Enter", label: t("ui_club.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setDetailId(r.id); return true; }),
    },
  ] : []);

  const exportCsv = () => downloadCsv("club-members.csv", [
    ["name", "phone", "code", "tier", "segment", "points", "visits", "total_spent", "last_purchase", "joined"],
    ...rows.map((m) => [m.name, m.phone, m.code, m.tier?.name || "", m.segment, m.points_balance, m.visits,
      m.total_spent, m.last_purchase_at || "", m.joined_at]),
  ]);

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
        <TextField inputRef={searchRef} size="small" label={t("ui_club2.search")} value={qInput}
          sx={{ ...S.field, flex: 1, minWidth: { xs: "100%", sm: 220 } }}
          onChange={(e) => { setQInput(e.target.value); cursor.reset(); }} />
        <TextField select size="small" label={t("ui_club.member.tier")} value={tier} onChange={(e) => setTier(e.target.value)}
          sx={{ ...S.field, minWidth: 130, flex: { xs: 1, sm: "none" } }}>
          <MenuItem value="">{t("ui_club2.all")}</MenuItem>
          <MenuItem value="none">{t("ui_club.tier.member")}</MenuItem>
          {tiers.map((x) => <MenuItem key={x.id} value={String(x.id)}>{x.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label={t("ui_club2.sort")} value={sort} onChange={(e) => setSort(e.target.value)}
          sx={{ ...S.field, minWidth: 130, flex: { xs: 1, sm: "none" } }}>
          {SORTS.map((s) => <MenuItem key={s} value={s}>{t(`ui_club2.sort_${s}`)}</MenuItem>)}
        </TextField>
        <Button sx={S.btn} onClick={() => setAdding(true)}>{t("ui_club.member.new")}</Button>
        <Button variant="outlined" sx={S.ghost} onClick={exportCsv} disabled={!rows.length}>{t("ui_club2.export")}</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1.5 }}>
        {["", ...SEGMENTS].map((s) => (
          <Chip key={s || "all"} size="small" clickable label={s ? t(`ui_club2.seg.${s}`) : t("ui_club2.all")}
            onClick={() => setSegment(s)} variant={segment === s ? "filled" : "outlined"}
            sx={segment === s ? { bgcolor: C.primary, color: C.onPrimary } : { color: C.sub }} />
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_club.empty")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("ui_club.member.name")}</TableCell>
                <TableCell sx={S.th}>{t("ui_club.member.phone")}</TableCell>
                <TableCell sx={S.th}>{t("ui_club.member.tier")}</TableCell>
                <TableCell sx={S.th}>{t("ui_club2.segment")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_club.member.points")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_club2.visits")}</TableCell>
                <TableCell sx={S.th}>{t("ui_club2.last_purchase")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((m, i) => {
                const cp = cursorProps(C, i === cursor.index);
                return (
                  <TableRow key={m.id} hover onClick={() => setDetailId(m.id)} {...cp}
                    sx={{ cursor: "pointer", opacity: m.is_active ? 1 : 0.55, ...(cp.sx || {}) }}>
                    <TableCell sx={{ ...S.td, fontWeight: 600 }}>{m.name || "—"}</TableCell>
                    <TableCell sx={S.td}><span dir="ltr">{m.phone}</span></TableCell>
                    <TableCell sx={S.td}><TierBadge tier={m.tier} C={C} /></TableCell>
                    <TableCell sx={S.td}>
                      {t(`ui_club2.seg.${m.segment}`)}
                      {m.rfm && <Typography component="span" sx={{ color: C.muted, fontSize: 11, ms: 0.5 }} dir="ltr"> {m.rfm.score}</Typography>}
                    </TableCell>
                    <TableCell sx={S.tdNum}>{fmtInt(m.points_balance, lang)}</TableCell>
                    <TableCell sx={S.tdNum}>{fmtInt(m.visits, lang)}</TableCell>
                    <TableCell sx={S.td}>{m.last_purchase_at ? fmtDate(m.last_purchase_at, lang) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {adding && (
        <MemberDialog ctx={ctx} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); notify(t("ui_club.member.saved")); load(); }} />
      )}
      {detailId != null && (
        <MemberDetailDialog ctx={ctx} id={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </Box>
  );
}
