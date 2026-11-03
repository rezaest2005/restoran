import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLang } from "@shared/contexts/LangContext";
import {
  Box, Typography, Button, TextField, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, Chip, InputAdornment, useMediaQuery, useTheme,
} from "@mui/material";
import { Add, Search, Edit, Delete, Storefront, Dashboard } from "@mui/icons-material";
import TenantModal from "@super/tenants/TenantModal";
import DeleteModal from "@super/common/DeleteModal";
import ServicesPanel from "@super/tenants/ServicesPanel";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";

/* ════════════════════════════════════════
   ActionBtn
   ════════════════════════════════════════ */

const ActionBtn = ({ icon, label, color, onClick, small }) => (
  <Box
    onClick={onClick}
    sx={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 0.3,
      cursor: "pointer", p: 0.5, borderRadius: "8px",
      minWidth: small ? 45 : 55,
      transition: "all 0.2s ease", "&:hover": { bgcolor: color + "15" },
    }}
  >
    {icon}
    <Typography sx={{ fontSize: small ? 8 : 9, fontWeight: 600, color }}>{label}</Typography>
  </Box>
);

/* ════════════════════════════════════════
   component
   ════════════════════════════════════════ */

export default function TenantsPanel({
  tenants, stats, loadTenants, loadServices,
  services, servicesLoading, C,
}) {
  const { t } = useTranslation();
  const { isRtl } = useLang();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState({ open: false, editData: null });   // ★ editData object
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: "" });
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    if (!search) return tenants;
    const q = search.toLowerCase();
    return tenants.filter(tn =>
      tn.name?.toLowerCase().includes(q) ||
      tn.slug?.toLowerCase().includes(q) ||
      tn.owner_name?.toLowerCase().includes(q)
    );
  }, [tenants, search]);

  /* ── styles ── */
  const glassCardSx = {
    bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden",
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif", bgcolor: C.inputBg, fontSize: 13,
      "& fieldset": { borderColor: C.glassBorder, borderWidth: 1 },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
  };

  /* ── select restaurant ── */
  // ── میان‌برها ──
  const selectedTenant = filtered.find((x) => x.id === selectedId) || null;
  const moveSelection = (dir) => {
    if (!filtered.length) return;
    const idx = filtered.findIndex((x) => x.id === selectedId);
    const next = idx === -1 ? (dir > 0 ? 0 : filtered.length - 1) : (idx + dir + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  };
  useRegisteredShortcuts([
    { combo: "F2", label: t("shortcuts.new"), handler: () => setModal({ open: true, editData: null }) },
    { combo: "Ctrl+A", label: t("shortcuts.next"), handler: () => moveSelection(1) },
    { combo: "Ctrl+Z", label: t("shortcuts.prev"), handler: () => moveSelection(-1) },
    { combo: "Enter", label: t("ui_h.edit_selected"), when: !!selectedTenant, handler: () => setModal({ open: true, editData: selectedTenant }) },
    { combo: "Delete", label: t("ui_h.delete_selected"), when: !!selectedTenant, handler: () => setDeleteModal({ open: true, id: selectedTenant.id, name: selectedTenant.name }) },
  ]);

  const handleSelect = (id) => {
    setSelectedId(id);
    loadServices(id);
  };

  /* ── open dashboard in new tab ── */
  const openDashboard = (e, slug) => {
    e.stopPropagation();
    window.open(`/${slug}/dashboard/login`, "_blank");
  };

  /* ── ★ باز کردن مودال ویرایش با کل داده ── */
  const openEdit = (e, tn) => {
    e.stopPropagation();
    setModal({ open: true, editData: tn });
  };

  /* ── ★ حذف کسب‌وکار ── */
  const handleDelete = async () => {
    try {
      const token = localStorage.getItem("super_token") || "";
      const res = await fetch(`/api/super/tenants/${deleteModal.id}/`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        loadTenants();
      }
    } catch (err) {
      console.error("Delete tenant error:", err);
    }
    setDeleteModal({ open: false, id: null, name: "" });
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"}>

      {/* ── header ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{
            width: 44, height: 44, borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `${C.olive}22`, color: C.olive,
          }}>
            <Storefront />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: C.text, fontSize: { xs: 18, md: 24 } }}>
            {t("super.tenants.title")}
          </Typography>
        </Box>
        <Button
          onClick={() => setModal({ open: true, editData: null })}
          startIcon={<Add />}
          size={isMobile ? "small" : "medium"}
          sx={{
            bgcolor: C.btnGrad, color: "#fff", fontWeight: 700,
            textTransform: "none", borderRadius: "12px",
            px: { xs: 2, md: 2.5 }, py: { xs: 0.7, md: 1 },
            fontSize: { xs: 12, md: 14 },
            boxShadow: `0 4px 14px ${C.olive}33`,
            "&:hover": { opacity: 0.9, transform: "translateY(-1px)" },
          }}
        >
          {t("super.tenants.new")}
        </Button>
      </Box>

      {/* ── search ── */}
      <TextField
        size="small"
        placeholder={t("super.tenants.search")}
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{ ...inputSx, mb: 2, maxWidth: { xs: "100%", md: 350 }, width: "100%" }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: C.muted }} />
              </InputAdornment>
            ),
          },
        }}
      />

      {/* ════════════════════════════════════
          موبایل: کارت‌ها
          ════════════════════════════════════ */}
      {isMobile ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: selectedId ? 3 : 0 }}>
          {filtered.map((tn, i) => (
            <Box
              key={tn.id}
              onClick={() => handleSelect(tn.id)}
              sx={{
                ...glassCardSx,
                p: 2, cursor: "pointer",
                bgcolor: selectedId === tn.id ? (C.tableRowSelected || C.oliveSubtle) : C.glass,
                border: selectedId === tn.id
                  ? `1.5px solid ${C.olive}`
                  : `1px solid ${C.glassBorder}`,
                opacity: 0,
                animation: `fadeUp 0.4s ease-out ${i * 0.03}s forwards`,
                "&:hover": { borderColor: C.olive },
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{
                    width: 30, height: 30, borderRadius: "8px",
                    bgcolor: C.oliveSubtle, color: C.olive,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, flexShrink: 0,
                  }}>
                    {tn.name?.charAt(0).toUpperCase()}
                  </Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {tn.name}
                  </Typography>
                </Box>
                <Chip
                  label={tn.is_active ? t("super.badge.active") : t("super.badge.inactive")}
                  size="small"
                  sx={{
                    bgcolor: tn.is_active ? (C.successBg || "#4CAF5020") : (C.dangerBg || "#E8405720"),
                    color: tn.is_active ? (C.success || "#4CAF50") : (C.danger || "#E84057"),
                    fontWeight: 600, borderRadius: "8px", fontSize: 10, height: 22,
                  }}
                />
              </Box>

              <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                <Chip label={tn.slug} size="small"
                  sx={{
                    bgcolor: C.glassBorder, color: C.sub,
                    borderRadius: "6px", fontFamily: "monospace",
                    fontSize: 10, height: 20,
                  }}
                />
                <Typography sx={{ fontSize: 11, color: C.muted }}>
                  {tn.owner_name || "—"}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", gap: 0.5, justifyContent: isRtl ? "flex-start" : "flex-end" }}>
                <ActionBtn small
                  icon={<Dashboard sx={{ fontSize: 14, color: C.info || "#2196F3" }} />}
                  label={t("super.action.dashboard")}
                  color={C.info || "#2196F3"}
                  onClick={(e) => openDashboard(e, tn.slug)}
                />
                <ActionBtn small
                  icon={<Edit sx={{ fontSize: 14, color: C.olive }} />}
                  label={t("super.action.edit")}
                  color={C.olive}
                  onClick={(e) => openEdit(e, tn)}
                />
                <ActionBtn small
                  icon={<Delete sx={{ fontSize: 14, color: C.danger }} />}
                  label={t("super.action.delete")}
                  color={C.danger}
                  onClick={(e) => { e.stopPropagation(); setDeleteModal({ open: true, id: tn.id, name: tn.name }); }}
                />
              </Box>
            </Box>
          ))}

          {filtered.length === 0 && (
            <Box sx={{ textAlign: "center", color: C.muted, py: 4 }}>
              {t("super.tenants.empty")}
            </Box>
          )}
        </Box>
      ) : (
        /* ════════════════════════════════════
           دسکتاپ: جدول
           ════════════════════════════════════ */
        <TableContainer sx={{ ...glassCardSx, mb: selectedId ? 3 : 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: C.tableHeaderBg || C.oliveSubtle }}>
                <TableCell sx={{ color: C.sub, fontWeight: 700, border: "none" }}>
                  {t("super.tenants.col.name")}
                </TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700, border: "none" }}>
                  {t("super.tenants.col.slug")}
                </TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700, border: "none" }}>
                  {t("super.tenants.col.owner")}
                </TableCell>
                <TableCell sx={{ color: C.sub, fontWeight: 700, border: "none" }}>
                  {t("super.tenants.col.status")}
                </TableCell>
                <TableCell align={isRtl ? "left" : "right"} sx={{ color: C.sub, fontWeight: 700, border: "none" }}>
                  {t("super.tenants.col.actions")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((tn, i) => (
                <TableRow
                  key={tn.id}
                  onClick={() => handleSelect(tn.id)}
                  sx={{
                    cursor: "pointer",
                    bgcolor: selectedId === tn.id ? (C.tableRowSelected || C.oliveSubtle) : "transparent",
                    transition: "background-color 0.2s ease",
                    "&:hover": {
                      bgcolor: selectedId === tn.id
                        ? (C.tableRowSelected || C.oliveSubtle)
                        : (C.tableRowHover || C.olive + "06"),
                    },
                    "& td": { borderBottom: `1px solid ${C.glassBorder}` },
                    "&:last-child td": { borderBottom: "none" },
                    opacity: 0, animation: `fadeUp 0.4s ease-out ${i * 0.03}s forwards`,
                  }}
                >
                  <TableCell sx={{ color: C.text, fontWeight: 600, py: 1.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{
                        width: 32, height: 32, borderRadius: "8px",
                        bgcolor: C.oliveSubtle, color: C.olive,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800,
                      }}>
                        {tn.name?.charAt(0).toUpperCase()}
                      </Box>
                      {tn.name}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: C.sub }}>
                    <Chip label={tn.slug} size="small"
                      sx={{ bgcolor: C.glassBorder, color: C.sub, borderRadius: "6px", fontFamily: "monospace" }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: C.sub }}>{tn.owner_name || "—"}</TableCell>
                  <TableCell>
                    <Chip
                      label={tn.is_active ? t("super.badge.active") : t("super.badge.inactive")}
                      size="small"
                      sx={{
                        bgcolor: tn.is_active ? (C.successBg || "#4CAF5020") : (C.dangerBg || "#E8405720"),
                        color: tn.is_active ? (C.success || "#4CAF50") : (C.danger || "#E84057"),
                        fontWeight: 600, borderRadius: "8px", fontSize: 11,
                      }}
                    />
                  </TableCell>
                  <TableCell align={isRtl ? "left" : "right"} sx={{ py: 1.5 }}>
                    <Box sx={{ display: "flex", gap: 0.5, justifyContent: isRtl ? "flex-start" : "flex-end" }}>
                      <ActionBtn
                        icon={<Dashboard sx={{ fontSize: 16, color: C.info || "#2196F3" }} />}
                        label={t("super.action.dashboard")}
                        color={C.info || "#2196F3"}
                        onClick={(e) => openDashboard(e, tn.slug)}
                      />
                      <ActionBtn
                        icon={<Edit sx={{ fontSize: 16, color: C.olive }} />}
                        label={t("super.action.edit")}
                        color={C.olive}
                        onClick={(e) => openEdit(e, tn)}
                      />
                      <ActionBtn
                        icon={<Delete sx={{ fontSize: 16, color: C.danger }} />}
                        label={t("super.action.delete")}
                        color={C.danger}
                        onClick={(e) => { e.stopPropagation(); setDeleteModal({ open: true, id: tn.id, name: tn.name }); }}
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", color: C.muted, py: 4, border: "none" }}>
                    {t("super.tenants.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── services panel ── */}
      <ServicesPanel
        tenantId={selectedId}
        tenantName={tenants.find(tn => tn.id === selectedId)?.name}
        services={services}
        loading={servicesLoading}
        onSave={() => loadTenants()}
        C={C}
        t={t}
      />

      {/* ── ★ modals — با پراپ‌های درست ── */}
      <TenantModal
        open={modal.open}
        editData={modal.editData}           // ★ کل آبجکت — نه فقط id
        onClose={() => setModal({ open: false, editData: null })}
        onSave={() => loadTenants()}        // ★ رفرش بعد ذخیره
        C={C}
        t={t}
      />
      <DeleteModal
        open={deleteModal.open}
        type="tenant"
        name={deleteModal.name}
        onClose={() => setDeleteModal({ open: false, id: null, name: "" })}
        onConfirm={handleDelete}            // ★ حذف واقعی
        C={C}
      />
    </Box>
  );
}

/* ════════════════════════════════════════
   animation (یکبار ساخته بشه)
   ════════════════════════════════════════ */
if (typeof document !== "undefined" && !document.getElementById("tenants-fadeup")) {
  const s = document.createElement("style");
  s.id = "tenants-fadeup";
  s.textContent = `@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(s);
}