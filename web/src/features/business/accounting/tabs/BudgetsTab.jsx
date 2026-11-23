import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, MenuItem, Alert,
  IconButton, LinearProgress,
} from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import KbdHint from "@shared/common/KbdHint";
import { TableWrap, Money, AccountPicker, ReportActions, accName, fmtDate, num, newKey, todayISO, ConfirmDialog } from "../common";
import { fetchBudgets, createBudget, fetchBudget, updateBudget, deleteBudget, errMsg } from "../api";

/** Light budgets: an amount per income/expense account (optionally per cost center) vs actual, with variance. */
export default function BudgetsTab(ctx) {
  const { t, C, S, lang, refreshKey, notify, accById, costCenters } = ctx;
  const [list, setList] = useState([]);
  const [selId, setSelId] = useState("");
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // {name,start_date,end_date,lines:[]}
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const loadList = useCallback(() => {
    fetchBudgets().then((d) => {
      setList(d || []);
      setSelId((cur) => cur || (d && d[0] ? String(d[0].id) : ""));
    }).catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [t]);
  useEffect(() => { loadList(); }, [loadList, refreshKey]);
  useEffect(() => {
    if (!selId) return;
    fetchBudget(selId).then(setData).catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [selId, refreshKey, t]);

  const startNew = () => {
    const y = new Date().getFullYear();
    setEditing({ id: null, name: "", start_date: `${y}-01-01`, end_date: `${y}-12-31`, lines: [{ key: newKey(), account: null, cc: "", amount: "" }] });
  };
  const startEdit = () => data && setEditing({
    id: data.id, name: data.name, start_date: data.start_date, end_date: data.end_date,
    lines: data.rows.map((r) => ({ key: newKey(), account: accById[r.account_id] || null, cc: r.cost_center_id ? String(r.cost_center_id) : "", amount: String(r.budget) })),
  });
  const save = async () => {
    if (!editing?.name.trim()) return;
    const body = {
      name: editing.name.trim(), start_date: editing.start_date, end_date: editing.end_date,
      lines: editing.lines.filter((l) => l.account && num(l.amount) >= 0 && l.amount !== "")
        .map((l) => ({ account_id: l.account.id, cost_center_id: l.cc || undefined, amount: num(l.amount) })),
    };
    try {
      const res = editing.id ? await updateBudget(editing.id, body) : await createBudget(body);
      notify(t("ui_i.entry.saved")); setEditing(null); setSelId(String(res.id)); setData(res); loadList();
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); }
  };
  const remove = async () => {
    try { await deleteBudget(selId); setConfirmDel(false); setSelId(""); setData(null); loadList(); notify(t("acc2.entry.deleted_ok")); } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed")));
    }
  };
  useRegisteredShortcuts([
    { combo: "F2", label: t("acc2.budgets.new"), handler: startNew },
    ...(editing ? [{ combo: "Ctrl+D", label: t("ui_i.common.save"), handler: save }] : []),
  ]);
  const setLine = (key, patch) => setEditing((e) => ({ ...e, lines: e.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const rowsForExport = () => {
    const out = [[t("ui_i.common.code"), t("ui_i.common.account"), t("ui_i.common.cost_center"), t("acc2.budgets.budget"), t("acc2.budgets.actual"), t("acc2.budgets.variance"), "%"]];
    (data?.rows || []).forEach((r) => out.push([r.code, accName(accById[r.account_id], lang) || r.name, r.cost_center, Number(r.budget), Number(r.actual), Number(r.variance), r.percent ?? ""]));
    out.push([t("ui_i.common.total"), "", "", Number(data?.total_budget || 0), Number(data?.total_actual || 0), Number(data?.total_variance || 0), ""]);
    return out;
  };

  return (
    <Box sx={S.card}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {editing ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" } }}>
            <TextField size="small" label={t("ui_i.common.name")} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} sx={S.field} autoFocus />
            <TextField type="date" size="small" label={t("ui_i.common.from")} value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" size="small" label={t("ui_i.common.to")} value={editing.end_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          {editing.lines.map((l) => (
            <Box key={l.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "3fr 2fr 2fr auto" }, alignItems: "center" }}>
              <AccountPicker ctx={{ ...ctx, accounts: ctx.accounts.filter((a) => a.type === "income" || a.type === "expense") }}
                postableOnly={false} value={l.account} onChange={(a) => setLine(l.key, { account: a })} />
              <TextField select size="small" value={l.cc} onChange={(e) => setLine(l.key, { cc: e.target.value })} sx={S.field}
                slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">{t("ui_i.common.cost_center")}: {t("ui_i.common.all")}</MenuItem>
                {costCenters.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
              </TextField>
              <TextField size="small" placeholder={t("ui_i.common.amount")} value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })}
                sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
              <IconButton aria-label={t("ui_i.common.remove")} sx={{ color: C.danger, width: 40, height: 40 }}
                onClick={() => setEditing((e) => ({ ...e, lines: e.lines.filter((x) => x.key !== l.key) }))}>✕</IconButton>
            </Box>
          ))}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" sx={S.ghost} onClick={() => setEditing((e) => ({ ...e, lines: [...e.lines, { key: newKey(), account: null, cc: "", amount: "" }] }))}>
              + {t("acc2.budgets.add_line")}
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="outlined" sx={S.ghost} onClick={() => setEditing(null)}>{t("ui_i.common.cancel")}</Button>
            <Button sx={S.btn} onClick={save} disabled={!editing.name.trim()}>{t("ui_i.common.save")}<KbdHint>Ctrl+D</KbdHint></Button>
          </Box>
        </Box>
      ) : (
        <>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
            <TextField select size="small" label={t("acc2.budgets.budget")} value={selId} onChange={(e) => setSelId(e.target.value)}
              sx={{ ...S.field, minWidth: 220 }}>
              {list.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>)}
            </TextField>
            {data && <Typography sx={{ color: C.sub, fontSize: 13 }}>{fmtDate(data.start_date, lang)} — {fmtDate(data.end_date, lang)}</Typography>}
            <Box sx={{ flex: 1 }} />
            {data && <ReportActions ctx={ctx} getRows={rowsForExport} filename={`budget-${data.id}-${todayISO()}`} />}
            {data && <Button variant="outlined" sx={S.ghost} onClick={startEdit}>{t("acc2.common.edit")}</Button>}
            {data && <Button variant="outlined" sx={{ ...S.ghost, color: C.danger }} onClick={() => setConfirmDel(true)}>{t("ui_i.common.remove")}</Button>}
            <Button sx={S.btn} onClick={startNew}>{t("acc2.budgets.new")}<KbdHint>F2</KbdHint></Button>
          </Box>
          {!data ? (
            <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("acc2.budgets.empty")}</Typography>
          ) : (
            <Box id="acc-print-area">
              <TableWrap C={C}>
                <Table size="small" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={S.th}>{t("ui_i.common.account")}</TableCell>
                      <TableCell sx={S.th}>{t("ui_i.common.cost_center")}</TableCell>
                      <TableCell sx={S.thNum}>{t("acc2.budgets.budget")}</TableCell>
                      <TableCell sx={S.thNum}>{t("acc2.budgets.actual")}</TableCell>
                      <TableCell sx={S.thNum}>{t("acc2.budgets.variance")}</TableCell>
                      <TableCell sx={{ ...S.th, minWidth: 140 }}>%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.rows.map((r) => {
                      const pct = r.percent == null ? null : Number(r.percent);
                      const over = r.type === "expense" ? pct > 100 : pct != null && pct < 100;
                      return (
                        <TableRow key={r.id}>
                          <TableCell sx={S.td}><Box component="span" dir="ltr" sx={{ color: C.muted, marginInlineEnd: 1 }}>{r.code}</Box>{accName(accById[r.account_id], lang) || r.name}</TableCell>
                          <TableCell sx={S.td}>{r.cost_center || "—"}</TableCell>
                          <TableCell sx={S.tdNum}><Money v={r.budget} lang={lang} C={C} /></TableCell>
                          <TableCell sx={S.tdNum}><Money v={r.actual} lang={lang} C={C} /></TableCell>
                          <TableCell sx={S.tdNum}><Money v={r.variance} lang={lang} C={C} /></TableCell>
                          <TableCell sx={S.td}>
                            {pct == null ? "—" : (
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <LinearProgress variant="determinate" value={Math.min(pct, 100)} sx={{ flex: 1, height: 8, borderRadius: 4,
                                  bgcolor: C.divider, "& .MuiLinearProgress-bar": { bgcolor: over ? C.danger : C.success } }} />
                                <Box component="span" dir="ltr" sx={{ fontSize: 12, color: over ? C.danger : C.sub }}>{pct}%</Box>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={2}>{t("ui_i.common.total")}</TableCell>
                      <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total_budget} lang={lang} C={C} /></TableCell>
                      <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total_actual} lang={lang} C={C} /></TableCell>
                      <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total_variance} lang={lang} C={C} /></TableCell>
                      <TableCell sx={S.td} />
                    </TableRow>
                  </TableBody>
                </Table>
              </TableWrap>
            </Box>
          )}
        </>
      )}
      <ConfirmDialog ctx={ctx} open={confirmDel} danger title={t("ui_i.common.remove")} text={t("acc2.budgets.delete_text")}
        confirmLabel={t("ui_i.common.remove")} onClose={() => setConfirmDel(false)} onConfirm={remove} />
    </Box>
  );
}
