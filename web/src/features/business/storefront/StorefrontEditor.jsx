import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItemButton, ListItemText, Snackbar, Stack, Tab, Tabs, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import ArrowUp from "@mui/icons-material/KeyboardArrowUp";
import ArrowDown from "@mui/icons-material/KeyboardArrowDown";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import { useRegisteredShortcuts, dialogBindings, tabBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import StorefrontRenderer from "../../public/storefront/StorefrontRenderer";
import FieldEditor from "./FieldEditor";
import ThemeTab from "./ThemeTab";
import AddressesTab from "./AddressesTab";
import RevisionsTab from "./RevisionsTab";
import {
  fetchMine, saveMine, publishMine, unpublishMine, applyTemplate, fetchTemplates, errMsg,
} from "./api";

const TABS = ["content", "theme", "addresses", "revisions"];

function ConfirmDialog({ open, title, text, onClose, onConfirm, busy }) {
  const { t } = useTranslation();
  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: () => !busy && onConfirm(), onClose: () => !busy && onClose() }),
    { enabled: open },
  );
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography>{text}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t("shortcuts.close_dialog")} <KbdHint>Esc</KbdHint></Button>
        <Button variant="contained" onClick={onConfirm} disabled={busy}>{t("shortcuts.confirm")} <KbdHint>Ctrl+D</KbdHint></Button>
      </DialogActions>
    </Dialog>
  );
}

function AddSectionDialog({ open, types, menuAvailable, onClose, onPick }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const list = types.filter((x) => x !== "footer" || true);
  useEffect(() => { if (open) setIdx(0); }, [open]);
  const pick = (i) => {
    const type = list[i];
    if (type) onPick(type);
  };
  useRegisteredShortcuts([
    { combo: "ArrowDown", label: t("ui_k.shortcut.next"), handler: () => setIdx((i) => Math.min(list.length - 1, i + 1)), scope: "dialog", allowInInput: true },
    { combo: "ArrowUp", label: t("ui_k.shortcut.prev"), handler: () => setIdx((i) => Math.max(0, i - 1)), scope: "dialog", allowInInput: true },
    { combo: "Enter", label: t("shortcuts.confirm"), handler: () => pick(idx), scope: "dialog", allowInInput: true },
    { combo: "Ctrl+D", label: t("shortcuts.confirm"), handler: () => pick(idx), scope: "dialog" },
    { combo: "Escape", label: t("shortcuts.close_dialog"), handler: onClose, scope: "dialog" },
  ], { enabled: open });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("ui_k.add_title")}</DialogTitle>
      <DialogContent>
        <List dense>
          {list.map((type, i) => (
            <ListItemButton key={type} selected={i === idx} onClick={() => pick(i)}>
              <ListItemText primary={t(`ui_k.section_type.${type}`)}
                secondary={type === "menu" && !menuAvailable ? t("ui_k.menu_needs_pos") : null} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}

let uid = 0;
const newId = (type, taken) => {
  let id;
  do { uid += 1; id = `${type}-${Date.now().toString(36)}${uid}`.slice(0, 32); } while (taken.has(id));
  return id;
};

export default function StorefrontEditor() {
  const { t } = useTranslation();
  const [srv, setSrv] = useState(null);
  const [theme, setTheme] = useState({});
  const [sections, setSections] = useState([]);
  const [language, setLanguage] = useState("fa");
  const [templates, setTemplates] = useState([]);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState("content");
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState("mobile");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "success" });
  const [confirm, setConfirm] = useState(null); // publish | unpublish | {template}
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [revKey, setRevKey] = useState(0);
  const listRef = useRef(null);

  const say = useCallback((message, type = "success") => setToast({ open: true, message, type }), []);

  const adopt = useCallback((d) => {
    setSrv(d);
    setTheme(d.theme);
    setSections(d.sections);
    setLanguage(d.content_language);
    setDirty(false);
    setSel((s) => Math.min(s, Math.max(0, d.sections.length - 1)));
  }, []);

  const load = useCallback(async () => {
    try {
      const [d, tpls] = await Promise.all([fetchMine(), fetchTemplates()]);
      adopt(d);
      setTemplates(tpls);
    } catch (e) {
      setError(errMsg(e, t("ui_k.error")));
    }
  }, [adopt, t]);
  useEffect(() => { load(); }, [load]);

  const mut = (fn) => { setSections(fn); setDirty(true); };
  const current = sections[sel];

  const save = useCallback(async () => {
    if (!srv || busy) return true;
    setBusy(true);
    try {
      const d = await saveMine({ theme, sections, content_language: language });
      adopt(d);
      say(t("ui_k.saved"));
      return true;
    } catch (e) {
      say(errMsg(e, t("ui_k.error")), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [srv, busy, theme, sections, language, adopt, say, t]);

  const doPublish = async () => {
    setBusy(true);
    try {
      if (dirty) {
        const d = await saveMine({ theme, sections, content_language: language });
        adopt(d);
      }
      adopt(await publishMine());
      setRevKey((k) => k + 1);
      say(t("ui_k.published"));
      setConfirm(null);
    } catch (e) {
      say(errMsg(e, t("ui_k.error")), "error");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };
  const doUnpublish = async () => {
    setBusy(true);
    try {
      adopt(await unpublishMine());
      say(t("ui_k.unpublished"));
    } catch (e) {
      say(errMsg(e, t("ui_k.error")), "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const doTemplate = async (key) => {
    setBusy(true);
    try {
      adopt(await applyTemplate(key));
      say(t("ui_k.theme.template_applied"));
    } catch (e) {
      say(errMsg(e, t("ui_k.error")), "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    mut((s) => { const c = [...s]; [c[i], c[j]] = [c[j], c[i]]; return c; });
    setSel(j);
  };
  const toggle = (i) => mut((s) => s.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)));
  const remove = (i) => {
    mut((s) => s.filter((_, k) => k !== i));
    setSel((s) => Math.max(0, Math.min(s, sections.length - 2)));
  };
  const add = (type) => {
    const id = newId(type, new Set(sections.map((s) => s.id)));
    mut((s) => [...s, { id, type, visible: true, data: type === "hero" ? { title: "" } : {} }]);
    setSel(sections.length);
    setAdding(false);
    setTab("content");
  };

  const typing = () => {
    const el = document.activeElement;
    return !!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
  };
  const tabItems = TABS.map((id) => ({ id, label: t(`ui_k.tab_${id}`) }));
  useRegisteredShortcuts([
    { combo: "Ctrl+D", label: t("ui_k.save"), handler: save },
    { combo: "F2", label: t("ui_k.shortcut.new_section"), handler: () => setAdding(true) },
    { combo: "Alt+ArrowUp", label: t("ui_k.shortcut.up"), handler: () => move(sel, -1) },
    { combo: "Alt+ArrowDown", label: t("ui_k.shortcut.down"), handler: () => move(sel, 1) },
    { combo: "Alt+H", label: t("ui_k.shortcut.toggle"), handler: () => current && toggle(sel) },
    { combo: "Delete", label: t("ui_k.shortcut.delete"), handler: () => (current ? remove(sel) : false) },
    { combo: "Ctrl+A", label: t("ui_k.shortcut.next"), handler: () => (typing() ? false : setSel((s) => Math.min(sections.length - 1, s + 1))) },
    { combo: "Ctrl+Z", label: t("ui_k.shortcut.prev"), handler: () => (typing() ? false : setSel((s) => Math.max(0, s - 1))) },
    { combo: "Ctrl+Shift+P", label: t("ui_k.shortcut.publish"), handler: () => setConfirm("publish") },
    { combo: "Alt+M", label: t("ui_k.shortcut.mobile"), handler: () => setDevice((d) => (d === "mobile" ? "desktop" : "mobile")) },
    ...tabBindings(t, tabItems, setTab),
  ], { enabled: !!srv });

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const preview = useMemo(() => srv && ({
    slug: srv.slug, name: "", content_language: language, theme, sections,
    menu_slug: srv.menu_available ? srv.business_slug : undefined,
    dashboard_url: srv.addresses.dashboard_url, club_join: false,
  }), [srv, language, theme, sections]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!srv) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ mb: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("ui_k.title")}</Typography>
        <Chip size="small" color={srv.is_published ? "success" : "default"}
          label={srv.is_published ? t("ui_k.status_published") : t("ui_k.status_draft")} />
        {dirty && <Chip size="small" color="warning" label={t("ui_k.dirty")} />}
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={save} disabled={busy || !dirty}>
          {t("ui_k.save")} <KbdHint>Ctrl+D</KbdHint>
        </Button>
        {srv.is_published && (
          <Button color="inherit" onClick={() => setConfirm("unpublish")} disabled={busy}>{t("ui_k.unpublish")}</Button>
        )}
        <Button variant="contained" onClick={() => setConfirm("publish")} disabled={busy}>
          {t("ui_k.publish")} <KbdHint>Ctrl+Shift+P</KbdHint>
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 2 }}>
        {tabItems.map((x, i) => <Tab key={x.id} value={x.id} label={`${x.label}  (Alt+${i + 1})`} />)}
      </Tabs>

      {tab === "theme" && (
        <ThemeTab theme={theme} language={language} fonts={srv.fonts} templates={templates} current={srv.template}
          onTheme={(v) => { setTheme(v); setDirty(true); }}
          onLanguage={(v) => { setLanguage(v); setDirty(true); }}
          onTemplate={(key) => setConfirm({ template: key })} />
      )}
      {tab === "addresses" && <AddressesTab addresses={srv.addresses} onReload={load} onToast={say} />}
      {tab === "revisions" && <RevisionsTab reloadKey={revKey} onToast={say} onRestored={() => { load(); setRevKey((k) => k + 1); }} />}

      {tab === "content" && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "250px minmax(280px,1fr) minmax(320px,1fr)" } }}>
          <Box ref={listRef}>
            <Stack direction="row" sx={{ mb: 1, alignItems: "center" }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{t("ui_k.sections")}</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                {t("ui_k.add_section")} <KbdHint>F2</KbdHint>
              </Button>
            </Stack>
            {sections.length === 0 && <Typography color="text.secondary">{t("ui_k.empty_sections")}</Typography>}
            <List dense disablePadding>
              {sections.map((s, i) => (
                <ListItemButton key={s.id} selected={i === sel} onClick={() => setSel(i)}
                  sx={{ borderRadius: 1, opacity: s.visible ? 1 : 0.55, pr: 0.5, pl: 1 }}>
                  <ListItemText primary={t(`ui_k.section_type.${s.type}`)}
                    secondary={s.visible ? (s.data.title || s.data.copyright || "") : t("ui_k.hidden")} slotProps={{ secondary: { noWrap: true } }} />
                  <Tooltip title={t("ui_k.move_up")}><span>
                    <IconButton size="small" disabled={i === 0} aria-label={t("ui_k.move_up")}
                      onClick={(e) => { e.stopPropagation(); move(i, -1); }}><ArrowUp fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title={t("ui_k.move_down")}><span>
                    <IconButton size="small" disabled={i === sections.length - 1} aria-label={t("ui_k.move_down")}
                      onClick={(e) => { e.stopPropagation(); move(i, 1); }}><ArrowDown fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <IconButton size="small" aria-label={s.visible ? t("ui_k.hide") : t("ui_k.show")}
                    onClick={(e) => { e.stopPropagation(); toggle(i); }}>
                    {s.visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                  </IconButton>
                  <IconButton size="small" aria-label={t("ui_k.delete")}
                    onClick={(e) => { e.stopPropagation(); remove(i); }}><DeleteIcon fontSize="small" /></IconButton>
                </ListItemButton>
              ))}
            </List>
          </Box>

          <Box>
            {current ? (
              <>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                  {t(`ui_k.section_type.${current.type}`)}
                </Typography>
                {current.type === "menu" && !srv.menu_available && (
                  <Alert severity="warning" sx={{ mb: 2 }}>{t("ui_k.menu_needs_pos")}</Alert>
                )}
                <FieldEditor fields={srv.section_fields[current.type] || {}} data={current.data}
                  onChange={(data) => mut((s) => s.map((x, k) => (k === sel ? { ...x, data } : x)))} />
              </>
            ) : <Typography color="text.secondary">{t("ui_k.no_section")}</Typography>}
          </Box>

          <Box>
            <Stack direction="row" sx={{ mb: 1, alignItems: "center" }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{t("ui_k.preview")}</Typography>
              <ToggleButtonGroup size="small" exclusive value={device} onChange={(_, v) => v && setDevice(v)}>
                <ToggleButton value="mobile">{t("ui_k.preview_mobile")}</ToggleButton>
                <ToggleButton value="desktop">{t("ui_k.preview_desktop")}</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Box sx={{
              border: 1, borderColor: "divider", borderRadius: 2, overflow: "auto", maxHeight: "75vh",
              width: device === "mobile" ? 360 : "100%", maxWidth: "100%", mx: "auto",
            }}>
              <StorefrontRenderer data={preview} preview />
            </Box>
          </Box>
        </Box>
      )}

      <AddSectionDialog open={adding} types={srv.section_types} menuAvailable={srv.menu_available}
        onClose={() => setAdding(false)} onPick={add} />
      <ConfirmDialog open={confirm === "publish"} busy={busy} title={t("ui_k.publish_title")}
        text={t("ui_k.publish_text")} onClose={() => setConfirm(null)} onConfirm={doPublish} />
      <ConfirmDialog open={confirm === "unpublish"} busy={busy} title={t("ui_k.unpublish")}
        text={t("ui_k.unpublish_text")} onClose={() => setConfirm(null)} onConfirm={doUnpublish} />
      <ConfirmDialog open={!!confirm?.template} busy={busy} title={t("ui_k.theme.apply_template")}
        text={t("ui_k.theme.template_confirm")} onClose={() => setConfirm(null)}
        onConfirm={() => doTemplate(confirm.template)} />

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast.type} onClose={() => setToast({ ...toast, open: false })}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
