import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Chip, Switch, FormControlLabel, Autocomplete, Alert, CircularProgress,
  MenuItem,
} from "@mui/material";
import { moduleEnabled, hasTab } from "@business/dashboard/access";
import BusinessAddressCard from "./BusinessAddressCard";
import {
  SectionHeader, LoadState, FormDialog, ConfirmDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs, cursorSx,
  cursorBindings, onEnter, useLoader,
} from "../common";
import {
  fetchUsers, createUser, updateUserRole, toggleUserActive, resetUserPassword, deleteUser, saveUserTabs,
  fetchWarehouses, fetchUserWarehouses, saveUserWarehouses, errMsg,
} from "../api";

/**
 * Permission tabs the server stores per user (ALL_TAB_KEYS), grouped by the module
 * that must be enabled for the business. `mods: null` = always available.
 * The ticks below are the ONLY place where per-user tab access is edited.
 */
const GROUPS = [
  { id: "general", icon: "🏠", mods: null, tone: "primary", keys: ["home"] },
  { id: "pos", icon: "💰", mods: ["pos"], tone: "success", keys: ["pos", "pos_report", "pos_settings", "orders"] },
  { id: "inventory", icon: "📦", mods: ["inventory"], tone: "info", keys: ["inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving", "inventory_purchase_list", "inventory_reports"] },
  { id: "production", icon: "🏭", mods: ["production"], tone: "warning", keys: ["dictionary_recipe"] },
  {
    id: "definitions", icon: "📚", mods: null, tone: "accent",
    keys: [
      { key: "dictionary_menu", mods: ["pos"] },
      { key: "dictionary_items", mods: ["inventory", "production"] },
      { key: "dictionary_suppliers", mods: ["inventory"] },
      { key: "dictionary_warehouses", mods: ["inventory"] },
      { key: "dictionary_customers", mods: ["pos", "inventory", "accounting"] },
      { key: "dictionary_users", mods: null },
    ],
  },
  { id: "more", icon: "🧩", mods: null, tone: "gold", keys: [
    { key: "club", mods: ["club"] }, { key: "accounting", mods: ["accounting"] },
    { key: "delivery_dispatch", mods: ["delivery"] }, { key: "delivery_shipments", mods: ["delivery"] },
    { key: "delivery_fleet", mods: ["delivery"] }, { key: "delivery_cash", mods: ["delivery"] },
    { key: "feedback", mods: ["feedback"] },
  ] },
];

const anyEnabled = (mods) => !mods || mods.some((m) => moduleEnabled(m));

/** Visible groups for this business: [{ ...group, keys: string[] }] (empty groups dropped). */
function visibleGroups() {
  return GROUPS.map((g) => ({
    ...g,
    keys: g.keys.map((k) => (typeof k === "string" ? { key: k, mods: g.mods } : k)).filter((k) => anyEnabled(k.mods) && hasTab(k.key)).map((k) => k.key),
  })).filter((g) => anyEnabled(g.mods) && g.keys.length > 0);
}

const MANAGER_ROLES = ["owner", "manager"];
const ROLES = ["manager", "cashier", "waiter", "kitchen", "customer"];

/** Quick-fill templates (only keys of enabled modules are applied). */
const TEMPLATES = {
  warehouse: ["home", "inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving", "inventory_purchase_list", "inventory_reports", "dictionary_items", "dictionary_suppliers", "dictionary_warehouses"],
  cashier: ["home", "pos", "pos_report", "pos_settings", "orders", "dictionary_menu", "dictionary_customers"],
  production: ["home", "dictionary_recipe", "dictionary_items", "inventory_warehouse", "inventory_reports"],
  manager: "all",
  none: [],
};

const readUser = () => {
  try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "{}"); } catch { return {}; }
};

const EMPTY_FORM = { username: "", password: "", phone_number: "", first_name: "", last_name: "", role: "cashier" };

export default function ManagersSection({ ctx }) {
  const { t, C, S, notify } = ctx;
  const groups = useMemo(() => visibleGroups(), []);
  const visibleKeys = useMemo(() => groups.flatMap((g) => g.keys), [groups]);
  const me = useMemo(() => readUser(), []);
  const iAmOwner = me.role === "owner" || !!me.is_superuser;
  const warehouseModule = moduleEnabled("inventory");

  const { data: userData, loading, error, reload: load } = useLoader(fetchUsers, "all", t("ui_def.common.load_failed"));
  const users = Array.isArray(userData) ? userData : [];
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(null); // null | { user: null | row }
  const [form, setForm] = useState(EMPTY_FORM);
  const [tabs, setTabs] = useState({});
  const [whAll, setWhAll] = useState(true);
  const [whIds, setWhIds] = useState([]);
  const [whRes, setWhRes] = useState({ token: 0, list: [], error: "" });
  const [seq, setSeq] = useState(0);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [reset, setReset] = useState(null);
  const [newPass, setNewPass] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState("");
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => `${u.username} ${u.first_name} ${u.last_name} ${u.phone_number}`.toLowerCase().includes(s));
  }, [users, q]);

  const isManagerRole = MANAGER_ROLES.includes(form.role);

  const openDialog = (user) => {
    setTouched(false); setFormErr("");
    setForm(user ? {
      username: user.username, password: "", phone_number: user.phone_number || "",
      first_name: user.first_name || "", last_name: user.last_name || "", role: user.role || "cashier",
    } : EMPTY_FORM);
    setTabs(user ? { ...user.tabs } : {});
    setWhAll(true); setWhIds([]);
    setSeq(seq + 1);
    setDialog({ user, token: seq + 1 });
  };

  // warehouses (list + this user's access) are loaded when the dialog opens
  const dialogToken = dialog?.token;
  const dialogUserId = dialog?.user?.id;
  useEffect(() => {
    if (!dialogToken || !warehouseModule) return undefined;
    let alive = true;
    Promise.all([fetchWarehouses(), dialogUserId ? fetchUserWarehouses(dialogUserId) : Promise.resolve({ all_access: true, warehouse_ids: [] })])
      .then(([list, access]) => {
        if (!alive) return;
        setWhAll(access?.all_access !== false);
        setWhIds((access?.warehouse_ids || []).map(Number));
        setWhRes({ token: dialogToken, list, error: "" });
      })
      .catch((e) => { if (alive) setWhRes({ token: dialogToken, list: [], error: errMsg(e, t("ui_def.common.load_failed")) }); });
    return () => { alive = false; };
  }, [dialogToken, dialogUserId, warehouseModule, t]);
  const whState = !dialog || !warehouseModule ? "idle" : whRes.token !== dialog.token ? "loading" : whRes.error ? "error" : "ready";
  const whList = whRes.list;
  const whErr = whRes.error;

  const applyTemplate = (id) => {
    const tpl = TEMPLATES[id];
    setTabs((cur) => {
      const next = { ...cur };
      visibleKeys.forEach((k) => { next[k] = tpl === "all" ? true : tpl.includes(k); });
      return next;
    });
  };
  const toggleKey = (k) => setTabs((s) => ({ ...s, [k]: !s[k] }));
  const toggleGroup = (g) => {
    const on = g.keys.every((k) => tabs[k]);
    setTabs((s) => ({ ...s, ...Object.fromEntries(g.keys.map((k) => [k, !on])) }));
  };
  const activeCount = visibleKeys.filter((k) => tabs[k]).length;

  const errs = {
    username: !form.username.trim(),
    password: !dialog?.user && form.password.length < 4,
  };

  const submit = async () => {
    setTouched(true);
    if (errs.username || errs.password) return;
    setSaving(true); setFormErr("");
    const editUser = dialog.user;
    let userId = editUser?.id;
    let created = false;
    try {
      if (editUser) {
        if (form.role !== editUser.role) await updateUserRole({ user_id: editUser.id, role: form.role });
      } else {
        const res = await createUser({
          username: form.username.trim(), password: form.password, phone_number: form.phone_number.trim(),
          first_name: form.first_name.trim(), last_name: form.last_name.trim(), role: form.role,
        });
        userId = res.user_id;
        created = true;
      }
      // hidden (disabled-module) keys keep their stored value; visible keys come from the ticks
      const merged = { ...(editUser?.tabs || {}), ...Object.fromEntries(visibleKeys.map((k) => [k, !!tabs[k]])) };
      await saveUserTabs({ user_id: userId, tabs: merged });
      if (warehouseModule && whState === "ready" && !isManagerRole && (editUser || !whAll)) {
        await saveUserWarehouses(userId, { all_access: whAll, warehouse_ids: whAll ? [] : whIds });
      }
      notify(editUser ? t("ui_def.users.updated", { name: editUser.username }) : t("ui_def.users.created", { name: form.username.trim() }), "success");
      setDialog(null);
      load();
    } catch (e) {
      const msg = errMsg(e, t("ui_def.common.save_failed"));
      if (created) {
        notify(t("ui_def.users.partial", { name: form.username.trim(), error: msg }), "warning");
        setDialog(null);
      } else {
        setFormErr(msg);
      }
      load();
    } finally { setSaving(false); }
  };

  const doToggle = async (u) => {
    try {
      await toggleUserActive({ user_id: u.id });
      notify(t(u.is_active ? "ui_def.users.deactivated" : "ui_def.users.activated", { name: u.username }), "success");
      load();
    } catch (e) { notify(errMsg(e, t("ui_def.common.save_failed")), "error"); }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteUser({ user_id: del.id });
      notify(t("ui_def.users.deleted", { name: del.username }), "success");
      setDel(null); load();
    } catch (e) { setDelErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setDelBusy(false); }
  };

  const doReset = async () => {
    if (newPass.length < 4) { setResetErr(t("ui_def.users.password_min")); return; }
    setResetBusy(true); setResetErr("");
    try {
      await resetUserPassword({ user_id: reset.id, new_password: newPass });
      notify(t("ui_def.users.password_changed", { name: reset.username }), "success");
      setReset(null); setNewPass("");
    } catch (e) { setResetErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setResetBusy(false); }
  };

  const cursor = useRowCursor(shown.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_def.users.new"), handler: () => openDialog(null) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = shown[cursor.index]; if (!r) return false; openDialog(r); return true; }) },
  ]);

  const tone = (name) => ({ primary: C.primary, success: C.success, info: C.info, warning: C.warning, accent: C.accent, gold: C.gold })[name] || C.primary;
  const roleLabel = (r) => t(`ui_def.users.roles.${r}`, { defaultValue: r });
  const roleOptions = iAmOwner || form.role === "owner" ? ["owner", ...ROLES] : ROLES;

  return (
    <Box>
      <BusinessAddressCard ctx={ctx} />
      <SectionHeader ctx={ctx} title={t("ui_def.users.title")} subtitle={t("ui_def.users.subtitle")}
        onNew={() => openDialog(null)} newLabel={t("ui_def.users.new")} search={q} onSearch={setQ} />
      <LoadState ctx={ctx} loading={loading && users.length === 0} error={error} onRetry={load}
        empty={!loading && shown.length === 0} emptyText={q ? t("ui_def.common.no_results") : t("ui_def.users.empty")}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {shown.map((u, i) => (
            <Box key={u.id} {...cursorAttrs(cursor.isActive(i))} sx={{
              ...cursorSx(C, cursor.isActive(i)), display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, p: 1.5,
              borderRadius: 2, bgcolor: C.glass, border: `1px solid ${u.is_active ? C.glassBorder : C.danger}`, opacity: u.is_active ? 1 : 0.75,
            }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text }}>{u.username}</Typography>
                  <Typography sx={{ fontSize: 12, color: C.sub }}>{`${u.first_name || ""} ${u.last_name || ""}`.trim()}</Typography>
                  <Chip size="small" label={roleLabel(u.role)} sx={{ color: C.primary, bgcolor: C.primarySubtle, fontWeight: 700 }} />
                  {!u.is_active && <Chip size="small" label={t("ui_def.common.inactive")} sx={{ color: C.danger, bgcolor: C.dangerBg, fontWeight: 700 }} />}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.75, flexWrap: "wrap" }}>
                  {visibleKeys.filter((k) => u.tabs?.[k]).map((k) => (
                    <Chip key={k} size="small" label={t(`ui_def.users.tabs.${k}`)} sx={{ height: 20, fontSize: 10, color: C.sub, bgcolor: C.divider }} />
                  ))}
                  {visibleKeys.every((k) => !u.tabs?.[k]) && (
                    <Typography sx={{ fontSize: 11, color: C.muted }}>{t("ui_def.users.no_access")}</Typography>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => openDialog(u)}>{t("ui_def.users.edit_access")}</Button>
                <Button size="small" sx={{ color: C.sub, textTransform: "none" }} onClick={() => { setReset(u); setNewPass(""); setResetErr(""); }}>{t("ui_def.users.reset_password")}</Button>
                <Button size="small" sx={{ color: u.is_active ? C.warning : C.success, textTransform: "none" }} onClick={() => doToggle(u)}>
                  {u.is_active ? t("ui_def.users.deactivate") : t("ui_def.users.activate")}
                </Button>
                <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(u); }}>{t("ui_def.common.delete")}</Button>
              </Box>
            </Box>
          ))}
        </Box>
      </LoadState>

      {dialog && (
        <FormDialog ctx={ctx} maxWidth="md" saving={saving} error={formErr} onClose={() => setDialog(null)} onSave={submit}
          title={dialog.user ? t("ui_def.users.edit_title", { name: dialog.user.username }) : t("ui_def.users.new_title")}
          saveLabel={dialog.user ? t("ui_def.common.save") : t("ui_def.users.create")}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{t("ui_def.users.section_info")}</Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label={t("ui_def.users.username")} value={form.username} disabled={!!dialog.user} size="small" sx={S.field} required autoFocus
              onChange={(e) => setForm({ ...form, username: e.target.value })} error={touched && errs.username}
              helperText={touched && errs.username ? t("ui_def.common.required") : ""} slotProps={{ htmlInput: { dir: "ltr" } }} />
            {!dialog.user && (
              <TextField label={t("ui_def.users.password")} type="password" value={form.password} size="small" sx={S.field} required
                onChange={(e) => setForm({ ...form, password: e.target.value })} error={touched && errs.password}
                helperText={touched && errs.password ? t("ui_def.users.password_min") : ""} slotProps={{ htmlInput: { autoComplete: "new-password" } }} />
            )}
            <TextField label={t("ui_def.users.first_name")} value={form.first_name} size="small" sx={S.field} disabled={!!dialog.user}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <TextField label={t("ui_def.users.last_name")} value={form.last_name} size="small" sx={S.field} disabled={!!dialog.user}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <TextField label={t("ui_def.users.phone")} value={form.phone_number} size="small" sx={S.field} disabled={!!dialog.user}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })} slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} />
            <TextField select label={t("ui_def.users.role")} value={form.role} size="small" sx={S.field}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              helperText={MANAGER_ROLES.includes(form.role) ? t("ui_def.users.role_manager_hint") : ""}>
              {roleOptions.map((r) => <MenuItem key={r} value={r}>{roleLabel(r)}</MenuItem>)}
            </TextField>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mt: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{t("ui_def.users.section_access")}</Typography>
            <Chip size="small" label={t("ui_def.users.active_count", { active: activeCount, total: visibleKeys.length })}
              sx={{ fontWeight: 700, color: activeCount ? C.primary : C.muted, bgcolor: activeCount ? C.primarySubtle : C.divider }} />
          </Box>
          <Alert severity="info" sx={{ py: 0 }}>{t("ui_def.users.access_hint")}</Alert>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
            <Typography sx={{ fontSize: 12, color: C.sub }}>{t("ui_def.users.templates")}:</Typography>
            {Object.keys(TEMPLATES).map((id) => (
              <Chip key={id} size="small" clickable onClick={() => applyTemplate(id)} label={t(`ui_def.users.tpl.${id}`)}
                sx={{ border: `1px solid ${C.glassBorder}`, bgcolor: "transparent", color: C.text }} />
            ))}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {groups.map((g) => {
              const color = tone(g.tone);
              const on = g.keys.filter((k) => tabs[k]).length;
              const all = on === g.keys.length;
              return (
                <Box key={g.id} sx={{ border: `1px solid ${all ? color : C.glassBorder}`, borderRadius: 2, overflow: "hidden" }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 0.75, bgcolor: C.inputBg }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                      <span aria-hidden="true">{g.icon}</span> {t(`ui_def.users.groups.${g.id}`)}
                      <Typography component="span" sx={{ fontSize: 11, color: C.muted, marginInlineStart: 1 }}>{on}/{g.keys.length}</Typography>
                    </Typography>
                    <Switch size="small" checked={all} onChange={() => toggleGroup(g)}
                      slotProps={{ input: { "aria-label": t(`ui_def.users.groups.${g.id}`) } }} />
                  </Box>
                  <Box sx={{ px: 1.5, py: 1, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    {g.keys.map((k) => (
                      <Chip key={k} clickable onClick={() => toggleKey(k)} aria-pressed={!!tabs[k]}
                        label={`${tabs[k] ? "✓ " : ""}${t(`ui_def.users.tabs.${k}`)}`}
                        sx={{
                          fontWeight: tabs[k] ? 800 : 500, color: tabs[k] ? color : C.sub,
                          bgcolor: tabs[k] ? C.primarySubtle : "transparent", border: `1px solid ${tabs[k] ? color : C.glassBorder}`,
                        }} />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {warehouseModule && (
            <>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.primary, mt: 1 }}>{t("ui_def.users.section_warehouses")}</Typography>
              {isManagerRole ? (
                <Typography sx={{ fontSize: 12, color: C.muted }}>{t("ui_def.users.wh_manager_all")}</Typography>
              ) : whState === "loading" ? (
                <CircularProgress size={20} />
              ) : whState === "error" ? (
                <Alert severity="warning">{whErr}</Alert>
              ) : (
                <>
                  <FormControlLabel sx={{ color: C.text, m: 0 }}
                    control={<Switch checked={whAll} onChange={(e) => setWhAll(e.target.checked)} />}
                    label={t("ui_def.users.wh_all")} />
                  {!whAll && (
                    <Autocomplete multiple size="small" options={whList} value={whList.filter((w) => whIds.includes(w.id))}
                      onChange={(_, v) => setWhIds(v.map((w) => w.id))} getOptionLabel={(w) => w.name} isOptionEqualToValue={(a, b) => a.id === b.id}
                      noOptionsText={t("ui_def.users.wh_none")}
                      renderInput={(p) => (
                        <TextField {...p} label={t("ui_def.users.wh_allowed")} sx={S.field}
                          helperText={whIds.length === 0 ? t("ui_def.users.wh_empty_warning") : ""} />
                      )} />
                  )}
                </>
              )}
            </>
          )}
        </FormDialog>
      )}

      {reset && (
        <FormDialog ctx={ctx} maxWidth="xs" saving={resetBusy} error={resetErr} onClose={() => setReset(null)} onSave={doReset}
          title={`${t("ui_def.users.reset_password")} — ${reset.username}`} saveLabel={t("ui_def.users.change_password")}>
          <TextField size="small" type="password" label={t("ui_def.users.new_password")} value={newPass} sx={S.field} autoFocus
            onChange={(e) => setNewPass(e.target.value)} slotProps={{ htmlInput: { autoComplete: "new-password" } }} />
        </FormDialog>
      )}

      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_def.users.delete_title")} text={t("ui_def.users.delete_text", { name: del?.username })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
