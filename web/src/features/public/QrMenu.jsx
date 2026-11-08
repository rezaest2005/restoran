import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Box, Typography, IconButton, TextField, InputAdornment, Alert, Button, CircularProgress, Chip } from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SearchIcon from "@mui/icons-material/Search";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { buildColors } from "@shared/palette";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import ProductCard, { formatPrice } from "./ProductCard";
import CartSheet from "./CartSheet";
import useShortcuts from "@shared/common/useShortcuts";
import KbdHint from "@business/pos/common/KbdHint";

const TABLE_RE = /^[\p{L}\p{N} -]{1,20}$/u;

function loadCart(slug) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(`qrcart:${slug}`) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export default function QrMenu() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const tableParam = (params.get("table") || "").trim();
  const { t } = useTranslation();
  const { mode, toggleTheme } = useThemeMode();
  const { lang, isRtl, toggleLang } = useLang();
  const isDark = mode === "dark";
  const C = useMemo(() => buildColors(isDark), [isDark]);

  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | notfound | error
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState(() => loadCart(slug));
  const [cartOpen, setCartOpen] = useState(false);
  const [tableInput, setTableInput] = useState("");
  const [tableTouched, setTableTouched] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => { setCart(loadCart(slug)); }, [slug]);
  useEffect(() => {
    try { sessionStorage.setItem(`qrcart:${slug}`, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart, slug]);

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    axios
      .get("/api/menu/public/", {
        params: { business_slug: slug, page_size: 200 },
        signal: ctrl.signal,
      })
      .then((res) => {
        setItems(Array.isArray(res.data?.results) ? res.data.results : []);
        setStatus("ok");
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setStatus(err?.response?.status === 404 ? "notfound" : "error");
      });
    return () => ctrl.abort();
  }, [slug, reloadKey]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const getName = useCallback((i) => (lang === "en" && i.name_en ? i.name_en : i.name), [lang]);

  // drop cart entries that no longer exist / are unavailable
  useEffect(() => {
    if (status !== "ok") return;
    setCart((c) => {
      const next = {};
      let changed = false;
      for (const [id, q] of Object.entries(c)) {
        const it = byId.get(Number(id));
        if (it && it.is_available !== false && q > 0) next[id] = q;
        else changed = true;
      }
      return changed ? next : c;
    });
  }, [status, byId]);

  const categories = useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      const key = i.category_id ?? "none";
      if (!m.has(key)) m.set(key, i.category_name || t("ui_d.qr.uncategorized"));
    });
    return [...m.entries()];
  }, [items, t]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && String(i.category_id ?? "none") !== category) return false;
      if (!q) return true;
      return `${i.name} ${i.name_en || ""}`.toLowerCase().includes(q);
    });
  }, [items, search, category]);

  const add = useCallback((id) => setCart((c) => ({ ...c, [id]: Math.min((c[id] || 0) + 1, 99) })), []);
  const dec = useCallback((id) => setCart((c) => {
    const q = (c[id] || 0) - 1;
    const n = { ...c };
    if (q > 0) n[id] = q; else delete n[id];
    return n;
  }), []);
  const del = useCallback((id) => setCart((c) => { const n = { ...c }; delete n[id]; return n; }), []);

  const lines = useMemo(
    () => Object.entries(cart).map(([id, qty]) => ({ item: byId.get(Number(id)), qty })).filter((l) => l.item),
    [cart, byId],
  );
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + Number(l.item.final_price) * l.qty, 0);

  const needTable = !tableParam;
  const table = needTable ? tableInput.trim() : tableParam;
  const tableValid = TABLE_RE.test(table);

  const submit = async () => {
    setError("");
    if (!tableValid) { setTableTouched(true); return; }
    setSubmitting(true);
    try {
      const res = await axios.post("/api/menu/order/", {
        business_slug: slug,
        table,
        customer_name: name.trim(),
        phone: phone.trim(),
        note: note.trim(),
        items: lines.map((l) => ({ food_id: l.item.id, quantity: l.qty })),
        website: "",
      });
      setDone(res.data?.data || {});
      setCart({});
      setCartOpen(false);
    } catch (err) {
      setError(err?.response?.data?.error || t("ui_d.qr.generic_error"));
    } finally {
      setSubmitting(false);
    }
  };

  // Ctrl+D = مشاهده/ثبت سفارش · F2 = سفارش جدید پس از ثبت · / = جستجو
  useShortcuts([
    { combo: "F2", label: t("ui_d.qr.new_order"), when: !!done, handler: () => { setDone(null); setNote(""); } },
    { combo: "Ctrl+D", label: t("ui_d.qr.view_order"), when: !done && count > 0, handler: () => setCartOpen(true) },
    { combo: "/", label: t("ui_d.qr.search_label"), when: !done,
      handler: () => document.getElementById("qr-search-input")?.focus() },
  ]);

  const pageSx = {
    minHeight: "100vh", background: C.bg, backgroundImage: C.bgWarm, color: C.text,
    px: 2, pt: 0, pb: 12,
  };
  const wrap = { maxWidth: 640, mx: "auto" };

  if (done) {
    return (
      <Box sx={{ ...pageSx, display: "flex", alignItems: "center", justifyContent: "center", pb: 4 }}>
        <Box sx={{
          width: "100%", maxWidth: 420, p: 3, textAlign: "center", borderRadius: 4,
          background: C.glass, border: `1px solid ${C.glassBorder}`, boxShadow: C.cardShadow,
        }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 72, color: C.success }} />
          <Typography sx={{ fontWeight: 800, fontSize: 20, my: 1 }}>{t("ui_d.qr.success_title")}</Typography>
          <Typography sx={{ color: C.sub }}>
            {t("ui_d.qr.order_number")}: <b style={{ color: C.text }}>{done.order_id}</b>
          </Typography>
          <Typography sx={{ color: C.sub }}>
            {t("ui_d.qr.table")}: <b style={{ color: C.text }}>{done.table ?? table}</b>
          </Typography>
          {done.total_price != null && (
            <Typography sx={{ color: C.sub }}>
              {t("ui_d.qr.total")}: <b style={{ color: C.primary }}>{formatPrice(done.total_price)} {t("ui_d.qr.currency")}</b>
            </Typography>
          )}
          <Button
            onClick={() => { setDone(null); setNote(""); }}
            sx={{ mt: 3, minHeight: 48, width: "100%", borderRadius: 2.5, fontWeight: 800, background: C.btnGrad, color: C.onPrimary, "&:hover": { background: C.btnHover } }}
          >
            {t("ui_d.qr.new_order")}
            <KbdHint>F2</KbdHint>
          </Button>
        </Box>
      </Box>
    );
  }

  const chipSx = (active) => ({
    height: 40, borderRadius: 5, fontWeight: 700, flexShrink: 0,
    background: active ? C.btnGrad : C.glass, color: active ? C.onPrimary : C.text,
    border: `1px solid ${active ? "transparent" : C.glassBorder}`,
    "&:hover": { background: active ? C.btnHover : C.primarySubtle },
  });

  return (
    <Box sx={pageSx}>
      <Box sx={wrap}>
        <Box sx={{
          position: "sticky", top: 0, zIndex: 5, py: 1.5, mx: -2, px: 2,
          background: C.headerBg, borderBottom: `1px solid ${C.headerBorder}`,          display: "flex", alignItems: "center", gap: 1,
        }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 800, fontSize: 18 }}>
              {slug || t("ui_d.qr.title_fallback")}
            </Typography>
            {tableParam && (
              <Typography sx={{ color: C.sub, fontSize: 12 }}>{t("ui_d.qr.table_n", { n: tableParam })}</Typography>
            )}
          </Box>
          <Button aria-label={t("ui_d.qr.toggle_lang")} onClick={toggleLang}
            sx={{ minWidth: 40, minHeight: 40, color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: 2, fontWeight: 700 }}>
            {isRtl ? "EN" : "فا"}
          </Button>
          <IconButton aria-label={t("ui_d.qr.toggle_theme")} onClick={toggleTheme}
            sx={{ width: 40, height: 40, color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: 2 }}>
            {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Box>

        {needTable && <Alert severity="info" sx={{ mt: 2 }}>{t("ui_d.qr.no_table_notice")}</Alert>}

        <TextField
          fullWidth size="small" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t("ui_d.qr.search_placeholder")}

          sx={{
            mt: 2,
            "& .MuiOutlinedInput-root": { background: C.inputBg, borderRadius: 3, color: C.text, minHeight: 44 },
            "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder },
          }} slotProps={{ htmlInput: { id: "qr-search-input", "aria-label": t("ui_d.qr.search_label") }, input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: C.muted }} /></InputAdornment> } }} />

        {categories.length > 1 && (
          <Box sx={{ display: "flex", gap: 1, mt: 1.5, pb: 0.5, overflowX: "auto" }}>
            <Chip label={t("ui_d.qr.all")} onClick={() => setCategory("all")} sx={chipSx(category === "all")} />
            {categories.map(([key, label]) => (
              <Chip key={key} label={label} onClick={() => setCategory(String(key))} sx={chipSx(category === String(key))} />
            ))}
          </Box>
        )}

        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
          {status === "loading" && (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <CircularProgress sx={{ color: C.primary }} />
              <Typography sx={{ color: C.sub, mt: 1 }}>{t("ui_d.qr.loading")}</Typography>
            </Box>
          )}
          {status === "notfound" && <Alert severity="warning">{t("ui_d.qr.not_found")}</Alert>}
          {status === "error" && (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>{t("ui_d.qr.retry")}</Button>}>
              {t("ui_d.qr.load_error")}
            </Alert>
          )}
          {status === "ok" && filtered.length === 0 && (
            <Typography sx={{ color: C.sub, textAlign: "center", py: 6 }}>{t("ui_d.qr.empty")}</Typography>
          )}
          {status === "ok" && filtered.map((it) => (
            <ProductCard key={it.id} item={it} name={getName(it)} qty={cart[it.id] || 0} C={C} onAdd={add} onRemove={dec} />
          ))}
        </Box>
      </Box>

      {count > 0 && (
        <Box sx={{
          position: "fixed", insetInline: 0, bottom: 0, zIndex: 10, px: 2, pt: 1.5,
          pb: "calc(12px + env(safe-area-inset-bottom, 0px))",
          background: C.headerBg, borderTop: `1px solid ${C.headerBorder}`,        }}>
          <Box sx={{ ...wrap, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ color: C.sub, fontSize: 12 }}>{t("ui_d.qr.items_count", { count })}</Typography>
              <Typography noWrap sx={{ fontWeight: 800, color: C.primary }}>
                {formatPrice(total)} {t("ui_d.qr.currency")}
              </Typography>
            </Box>
            <Button onClick={() => setCartOpen(true)}
              sx={{ minHeight: 48, px: 3, borderRadius: 2.5, fontWeight: 800, background: C.btnGrad, color: C.onPrimary, "&:hover": { background: C.btnHover } }}>
              {t("ui_d.qr.view_order")}
              <KbdHint>Ctrl+D</KbdHint>
            </Button>
          </Box>
        </Box>
      )}

      <CartSheet
        open={cartOpen} onClose={() => setCartOpen(false)} C={C}
        lines={lines} total={total} getName={getName}
        onAdd={add} onRemove={dec} onDelete={del}
        needTable={needTable} tableValue={tableInput}
        onTableChange={(v) => { setTableInput(v); setTableTouched(true); }}
        tableError={needTable && tableTouched && !tableValid}
        name={name} onName={setName} phone={phone} onPhone={setPhone} note={note} onNote={setNote}
        submitting={submitting} error={error} onSubmit={submit}
      />
    </Box>
  );
}
