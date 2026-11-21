import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, Button, TextField, Chip, Switch, FormControlLabel, Autocomplete, Alert, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails,
} from "@mui/material";
import { moduleEnabled, hasTab } from "@business/dashboard/access";
import { appUrl } from "@shared/basePath";
import CopyLink from "@business/delivery/CopyLink";
import BusinessAddressCard from "./BusinessAddressCard";
import TransportPersonDialog, { OptionCard } from "./TransportPersonDialog";
import {
  SectionHeader, LoadState, FormDialog, ConfirmDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs, cursorSx,
  cursorBindings, onEnter, useLoader,
} from "../common";
import {
  fetchUsers, createUser, updateUserRole, toggleUserActive, resetUserPassword, deleteUser, saveUserTabs,
  fetchWarehouses, fetchUserWarehouses, saveUserWarehouses, fetchTransportOptions, createTransportPerson,
  updateTransportPerson, errMsg,
} from "../api";

/**
 * Permission tabs the server stores per user (ALL_TAB_KEYS), grouped by the module
 * that must be enabled for the business. `mods: null` = always available.
 * These ticks live under "Advanced" — a role preset fills them in for you.
 */
const GROUPS = [
  { id: "general", icon: "🏠", mods: null, tone: "primary", keys: ["home", "activity"] },
  { id: "pos", icon: "💰", mods: ["pos"], tone: "success", keys: ["pos", "pos_report", "pos_settings", "orders"] },
  { id: "inventory", icon: "📦", mods: ["inventory"], tone: "info", keys: ["inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving", "inventory_purchase_list", "inventory_reports"] },
  { id: "production", icon: "🏭", mods: ["production"], tone: "warning", keys: ["kitchen", "recipes", "dictionary_recipe"] },
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
  // office staff who RUN transport (drivers / couriers themselves are "Transport" people, not these ticks)
  { id: "transport", icon: "🚚", mods: ["delivery"], tone: "gold", keys: ["delivery_dispatch", "delivery_shipments", "delivery_fleet", "delivery_cash", "delivery_history"] },
  { id: "more", icon: "🧩", mods: null, tone: "gold", keys: [
    { key: "club", mods: ["club"] }, { key: "accounting", mods: ["accounting"] }, { key: "feedback", mods: ["feedback"] },
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

/**
 * Staff role presets: picking one sets the role AND ticks its tabs (only tabs of enabled modules apply).
 * `mods` = shown only when one of these modules is on.
 */
const PRESETS = [
  { role: "manager", icon: "🧑‍💼", mods: null, tabs: "all" },
  { role: "cashier", icon: "💰", mods: ["pos"], tabs: ["home", "pos", "pos_report", "orders", "dictionary_customers", "delivery_dispatch"] },
  { role: "waiter", icon: "🙋", mods: ["pos"], tabs: ["home", "pos", "orders"] },
  { role: "warehouse", icon: "📦", mods: ["inventory"], tabs: ["home", "inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving", "inventory_purchase_list", "inventory_reports", "dictionary_items", "dictionary_suppliers", "dictionary_warehouses"] },
  { role: "kitchen", icon: "🏭", mods: ["production"], tabs: ["home", "kitchen", "recipes", "dictionary_recipe", "dictionary_items", "inventory_warehouse"] },
];
const STAFF_ROLES = ["owner", ...PRESETS.map((p) => p.role)];
const MANAGER_ROLES = ["owner", "manager"];
const TRANSPORT_ROLES = ["transport", "driver", "courier"];

/** staff | transport | other — the three kinds of people you can add. */
const personType = (role) => (TRANSPORT_ROLES.includes(role) ? "transport" : STAFF_ROLES.includes(role) ? "staff" : "other");

const EMPTY_FORM = { username: "", password: "", phone_number: "", first_name: "", last_name: "", role: "cashier" };
const TYPE_ICON = { staff: "🧑‍💼", transport: "🚚", other: "🧩" };

export default function ManagersSection({ ctx }) {
  const { t, C, S, notify } = ctx;
  const groups = useMemo(() => visibleGroups(), []);
  const visibleKeys = useMemo(() => groups.flatMap((g) => g.keys), [groups]);
  const presets = useMemo(() => PRESETS.filter((p) => anyEnabled(p.mods)), []);
  const warehouseModule = moduleEnabled("inventory");
  const deliveryModule = moduleEnabled("delivery");

  const { data: userData, loading, error, reload: load } = useLoader(fetchUsers, "all", t("ui_def.common.load_failed"));
  const users = useMemo(() => (Array.isArray(userData) ? userData : []), [userData]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [picker, setPicker] = useState(false);          // step 1 of "add person": choose the type
  const [dialog, setDialog] = useState(null);           // staff / other dialog: { user: null | row, type, token }
  const [transport, setTransport] = useState(null);     // transport dialog: { user: null | row, options }
  const [form, setForm] = useState(EMPTY_FORM);
  const [tabs, setTabs] = useState({});
  const [advanced, setAdvanced] = useState(false);
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

  const counts = useMemo(() => {
    const c = { all: users.length, staff: 0, transport: 0, other: 0 };
    users.forEach((u) => { c[personType(u.role)] += 1; });
    return c;
  }, [users]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => (filter === "all" || personType(u.role) === filter)
      && (!s || `${u.username} ${u.first_name} ${u.last_name} ${u.phone_number}`.toLowerCase().includes(s)));
  }, [users, q, filter]);

  const isManagerRole = MANAGER_ROLES.includes(form.role);
  const tabLabel = (k) => t(`ui_dh.tabs.${k}`, { defaultValue: t(`ui_def.users.tabs.${k}`) });
  const roleLabel = (r) => t(`ui_dh.roles.${r}`, { defaultValue: t(`ui_def.users.roles.${r}`, { defaultValue: r }) });
  const groupLabel = (id) => t(`ui_dh.groups.${id}`, { defaultValue: t(`ui_def.users.groups.${id}`) });

  const ticksFor = (tpl) => Object.fromEntries(visibleKeys.map((k) => [k, tpl === "all" ? true : tpl.includes(k)]));

  /* ── open dialogs ─────────────────────────────── */
  const openStaff = (user, type) => {
    setTouched(false); setFormErr("");
    const first = presets.find((p) => p.role === "cashier") || presets[0];
    const role = user ? (user.role || "cashier") : type === "other" ? "other" : first.role;
    setForm(user ? {
      username: user.username, password: "", phone_number: user.phone_number || "",
      first_name: user.first_name || "", last_name: user.last_name || "", role,
    } : { ...EMPTY_FORM, role });
    const preset = PRESETS.find((p) => p.role === role);
    setTabs(user ? { ...user.tabs } : preset ? ticksFor(preset.tabs) : { home: true });
    setAdvanced(type === "other");
    setWhAll(true); setWhIds([]);
    setSeq(seq + 1);
    setDialog({ user, type, token: seq + 1 });
  };

  const openTransport = async (user) => {
    try {
      const options = await fetchTransportOptions();
      setTransport({ user, options });
    } catch (e) { notify(errMsg(e, t("ui_def.common.load_failed")), "error"); }
  };

  const openPerson = (user) => {
    const type = personType(user.role);
    if (type === "transport") openTransport(user);
    else openStaff(user, type);
  };

  const pickType = (type) => {
    setPicker(false);
    if (type === "transport") openTransport(null);
    else openStaff(null, type);
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

  const pickPreset = (p) => {
    setForm((f) => ({ ...f, role: p.role }));
    if (p.tabs) setTabs((cur) => ({ ...cur, ...ticksFor(p.tabs) }));
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

  const saveTransport = async (body) => {
    const editUser = transport.user;
    if (editUser) await updateTransportPerson(editUser.id, body);
    else await createTransportPerson(body);
    notify(editUser ? t("ui_def.users.updated", { name: editUser.username }) : t("ui_dh.transport.created", { name: body.name }), "success");
    setTransport(null);
    load();
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

  const busyDialog = picker || !!dialog || !!transport;
  const cursor = useRowCursor(shown.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_dh.people.new"), handler: () => setPicker(true) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = shown[cursor.index]; if (!r) return false; openPerson(r); return true; }) },
  ], { enabled: !busyDialog });

  const tone = (name) => ({ primary: C.primary, success: C.success, info: C.info, warning: C.warning, accent: C.accent, gold: C.gold })[name] || C.primary;
  const smallChip = { height: 20, fontSize: 10, color: C.sub, bgcolor: C.divider };

  const accessSummary = (u, type) => {
    if (type === "transport") {
      const d = u.driver;
      if (!d) return <Typography sx={{ fontSize: 11, color: C.warning }}>{t("ui_dh.transport.no_record")}</Typography>;
      return (
        <>
          {d.number && <Chip size="small" label={t("ui_dh.transport.number", { n: d.number })} sx={smallChip} />}
          <Chip size="small" label={t(`ui_dh.transport.services.${d.service || "both"}.title`)} sx={smallChip} />
          {d.vehicle && <Chip size="small" label={[t(`ui_del.vehicle_kind.${d.vehicle.kind}`), d.vehicle.plate].filter(Boolean).join(" · ")} sx={smallChip} />}
          <CopyLink url={appUrl(d.link_path)} label={t("ui_dh.transport.copy_link")} doneLabel={t("ui_del.ship.copied")} />
        </>
      );
    }
    if (MANAGER_ROLES.includes(u.role)) return <Typography sx={{ fontSize: 11, color: C.sub }}>{t("ui_dh.people.full_access")}</Typography>;
    const keys = visibleKeys.filter((k) => u.tabs?.[k]);
    if (!keys.length) return <Typography sx={{ fontSize: 11, color: C.muted }}>{t("ui_def.users.no_access")}</Typography>;
    return (
      <>
        {keys.slice(0, 6).map((k) => <Chip key={k} size="small" label={tabLabel(k)} sx={smallChip} />)}
        {keys.length > 6 && <Chip size="small" label={`+${keys.length - 6}`} sx={smallChip} />}
      </>
    );
  };

  const personRow = (u, i) => {
    const type = personType(u.role);
    return (
      <Box key={u.id} {...cursorAttrs(cursor.isActive(i))} sx={{
        ...cursorSx(C, cursor.isActive(i)), display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, p: 1.5,
        borderRadius: 2, bgcolor: C.glass, border: `1px solid ${u.is_active ? C.glassBorder : C.danger}`, opacity: u.is_active ? 1 : 0.75,
      }}>
        <Typography aria-hidden="true" sx={{ fontSize: 22 }}>{TYPE_ICON[type]}</Typography>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text }}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username}</Typography>
            <Typography dir="ltr" sx={{ fontSize: 12, color: C.sub }}>{u.username}</Typography>
            <Chip size="small" label={roleLabel(u.role)} sx={{ color: C.primary, bgcolor: C.primarySubtle, fontWeight: 700 }} />
            {!u.is_active && <Chip size="small" label={t("ui_def.common.inactive")} sx={{ color: C.danger, bgcolor: C.dangerBg, fontWeight: 700 }} />}
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, mt: 0.75, flexWrap: "wrap", alignItems: "center" }}>
            {accessSummary(u, type)}
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => openPerson(u)}>{t("ui_def.common.edit")}</Button>
          <Button size="small" sx={{ color: C.sub, textTransform: "none" }} onClick={() => { setReset(u); setNewPass(""); setResetErr(""); }}>{t("ui_def.users.reset_password")}</Button>
          <Button size="small" sx={{ color: u.is_active ? C.warning : C.success, textTransform: "none" }} onClick={() => doToggle(u)}>
            {u.is_active ? t("ui_def.users.deactivate") : t("ui_def.users.activate")}
          </Button>
          <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(u); }}>{t("ui_def.common.delete")}</Button>
        </Box>
      </Box>
    );
  };

  // the owner role belongs to the account purchaser only: shown when editing that owner, never offered for a new person
  const presetOptions = form.role === "owner" ? [{ role: "owner", icon: "👑", tabs: "all" }, ...presets] : presets;
  // an edited user may hold a role that is not offered as a preset (e.g. its module was switched off): keep it visible
  const presetList = presetOptions.some((p) => p.role === form.role) || dialog?.type !== "staff"
    ? presetOptions : [...presetOptions, { role: form.role, icon: "•" }];
  const transportPerson = (u) => (u ? (u.driver || {
    name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
    phone: u.phone_number || "", user_id: u.id, username: u.username, is_active: u.is_active,
  }) : null);

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_dh.people.title")} subtitle={t("ui_dh.people.subtitle")}
        onNew={() => setPicker(true)} newLabel={t("ui_dh.people.new")} search={q} onSearch={setQ}>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }} role="group" aria-label={t("ui_dh.people.filter")}>
          {["all", "staff", "transport", "other"].map((k) => (
            <Chip key={k} clickable onClick={() => setFilter(k)} aria-pressed={filter === k}
              label={`${t(`ui_dh.people.filters.${k}`)} (${counts[k]})`}
              sx={{
                fontWeight: filter === k ? 800 : 500, bgcolor: filter === k ? C.primarySubtle : "transparent",
                color: filter === k ? C.primary : C.sub, border: `1px solid ${filter === k ? C.primary : C.glassBorder}`,
              }} />
          ))}
        </Box>
      </SectionHeader>
      <LoadState ctx={ctx} loading={loading && users.length === 0} error={error} onRetry={load}
        empty={!loading && shown.length === 0} emptyText={q || filter !== "all" ? t("ui_def.common.no_results") : t("ui_def.users.empty")}
        emptyAction={q ? null : {
          label: filter === "transport" ? t("ui_dh.people.types.transport.title") : t("ui_dh.people.new"),
          onClick: () => (filter === "transport" ? pickType("transport") : setPicker(true)),
          icon: filter === "transport" ? "🚚" : "👥", hint: t("ui_dh.empty_hint.users"),
        }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {shown.map(personRow)}
        </Box>
      </LoadState>

      <Box sx={{ mt: 3 }}>
        <BusinessAddressCard ctx={ctx} />
      </Box>

      {/* step 1 — who are you adding? */}
      {picker && (
        <FormDialog ctx={ctx} maxWidth="sm" title={t("ui_dh.people.type_title")} onClose={() => setPicker(false)}
          onSave={() => pickType("staff")} saveLabel={t("ui_dh.people.types.staff.title")}>
          <Typography sx={{ fontSize: 13, color: C.sub }}>{t("ui_dh.people.type_hint")}</Typography>
          <Box role="radiogroup" aria-label={t("ui_dh.people.type_title")} sx={{ display: "grid", gap: 1.25 }}>
            {["staff", "transport", "other"].map((type) => (
              <OptionCard key={type} ctx={ctx} icon={TYPE_ICON[type]} selected={false} onClick={() => pickType(type)}
                disabled={type === "transport" && !deliveryModule}
                title={t(`ui_dh.people.types.${type}.title`)}
                hint={type === "transport" && !deliveryModule ? t("ui_dh.transport.module_off") : t(`ui_dh.people.types.${type}.hint`)} />
            ))}
          </Box>
        </FormDialog>
      )}

      {transport && (
        <TransportPersonDialog ctx={ctx} mode="users" vehicles={transport.options?.vehicles || []}
          person={transportPerson(transport.user)} onSubmit={saveTransport} onClose={() => setTransport(null)} />
      )}

      {dialog && (
        <FormDialog ctx={ctx} maxWidth="md" saving={saving} error={formErr} onClose={() => setDialog(null)} onSave={submit}
          title={dialog.user ? t("ui_def.users.edit_title", { name: dialog.user.username }) : t(`ui_dh.people.new_${dialog.type}`)}
          saveLabel={dialog.user ? t("ui_def.common.save") : t("ui_def.users.create")}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{t("ui_def.users.section_info")}</Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label={t("ui_def.users.first_name")} value={form.first_name} size="small" sx={S.field} disabled={!!dialog.user} autoFocus={!dialog.user}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <TextField label={t("ui_def.users.last_name")} value={form.last_name} size="small" sx={S.field} disabled={!!dialog.user}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <TextField label={t("ui_def.users.username")} value={form.username} disabled={!!dialog.user} size="small" sx={S.field} required
              onChange={(e) => setForm({ ...form, username: e.target.value })} error={touched && errs.username}
              helperText={touched && errs.username ? t("ui_def.common.required") : ""} slotProps={{ htmlInput: { dir: "ltr" } }} />
            {!dialog.user && (
              <TextField label={t("ui_def.users.password")} type="password" value={form.password} size="small" sx={S.field} required
                onChange={(e) => setForm({ ...form, password: e.target.value })} error={touched && errs.password}
                helperText={touched && errs.password ? t("ui_def.users.password_min") : ""} slotProps={{ htmlInput: { autoComplete: "new-password" } }} />
            )}
            <TextField label={t("ui_def.users.phone")} value={form.phone_number} size="small" sx={S.field} disabled={!!dialog.user}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })} slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} />
          </Box>

          {dialog.type === "staff" ? (
            <>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.primary, mt: 1 }}>{t("ui_dh.people.preset_title")}</Typography>
              <Typography sx={{ fontSize: 12, color: C.sub, mt: -1 }}>{t("ui_dh.people.preset_hint")}</Typography>
              <Box role="radiogroup" aria-label={t("ui_dh.people.preset_title")} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" } }}>
                {presetList.map((p) => (
                  <OptionCard key={p.role} ctx={ctx} icon={p.icon} selected={form.role === p.role} onClick={() => pickPreset(p)}
                    title={roleLabel(p.role)} hint={t(`ui_dh.people.presets.${p.role}`, { defaultValue: "" })} />
                ))}
              </Box>
            </>
          ) : (
            <Alert severity="info" sx={{ py: 0 }}>{t("ui_dh.people.other_hint")}</Alert>
          )}

          <Accordion disableGutters expanded={advanced} onChange={(_, v) => setAdvanced(v)}
            sx={{ bgcolor: "transparent", boxShadow: "none", border: `1px solid ${C.glassBorder}`, borderRadius: "12px !important", "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<span aria-hidden="true" style={{ color: C.sub }}>▾</span>}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text }}>{t("ui_dh.people.advanced")}</Typography>
                <Chip size="small" label={isManagerRole ? t("ui_dh.people.full_access") : t("ui_def.users.active_count", { active: activeCount, total: visibleKeys.length })}
                  sx={{ fontWeight: 700, color: activeCount ? C.primary : C.muted, bgcolor: activeCount ? C.primarySubtle : C.divider }} />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Typography sx={{ fontSize: 12, color: C.sub }}>{isManagerRole ? t("ui_def.users.role_manager_hint") : t("ui_def.users.access_hint")}</Typography>
              {groups.map((g) => {
                const color = tone(g.tone);
                const on = g.keys.filter((k) => tabs[k]).length;
                const all = on === g.keys.length;
                return (
                  <Box key={g.id} sx={{ border: `1px solid ${all ? color : C.glassBorder}`, borderRadius: 2, overflow: "hidden" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 0.75, bgcolor: C.inputBg }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                        <span aria-hidden="true">{g.icon}</span> {groupLabel(g.id)}
                        <Typography component="span" sx={{ fontSize: 11, color: C.muted, marginInlineStart: 1 }}>{on}/{g.keys.length}</Typography>
                      </Typography>
                      <Switch size="small" checked={all} onChange={() => toggleGroup(g)} slotProps={{ input: { "aria-label": groupLabel(g.id) } }} />
                    </Box>
                    {g.id === "transport" && (
                      <Typography sx={{ fontSize: 11, color: C.sub, px: 1.5, pt: 0.75 }}>{t("ui_dh.people.transport_group_hint")}</Typography>
                    )}
                    <Box sx={{ px: 1.5, py: 1, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                      {g.keys.map((k) => (
                        <Chip key={k} clickable onClick={() => toggleKey(k)} aria-pressed={!!tabs[k]}
                          label={`${tabs[k] ? "✓ " : ""}${tabLabel(k)}`}
                          sx={{
                            fontWeight: tabs[k] ? 800 : 500, color: tabs[k] ? color : C.sub,
                            bgcolor: tabs[k] ? C.primarySubtle : "transparent", border: `1px solid ${tabs[k] ? color : C.glassBorder}`,
                          }} />
                      ))}
                    </Box>
                  </Box>
                );
              })}

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
            </AccordionDetails>
          </Accordion>
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
