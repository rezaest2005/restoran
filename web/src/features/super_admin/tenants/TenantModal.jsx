// web/src/features/super_admin/tenants/TenantModal.jsx
import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, TextField, Chip, Checkbox,
  IconButton, Collapse,
} from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import superClient from "@super/api/super_client";
import {
  ALL_PERM_CODES,
  PERM_LABELS,
  PERM_GROUPS,
  ROLE_PERM_PRESETS,
} from "@super/shared/superConfig";

const fieldSx = {
  "& .MuiOutlinedInput-root": { borderRadius: "12px", fontSize: 13 },
  "& .MuiInputLabel-root": { fontSize: 12 },
};

export default function TenantModal({ open, onClose, editData, onSave, C, t }) {
  const editId = editData?.id || null;

  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_username: "",
    owner_password: "",
    owner_name: "",
    phone: "",
    address: "",
    start_date: "",
    end_date: "",
    perms: [],
  });

  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [role, setRole] = useState("warehouse");

  useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          name: editData.name || "",
          slug: editData.slug || "",
          owner_username: editData.owner_username || "",
          owner_password: "",
          owner_name: editData.owner_name || "",
          phone: editData.phone || "",
          address: editData.address || "",
          start_date: editData.start_date || "",
          end_date: editData.end_date || "",
          perms: editData.perms || editData.dashboard_permissions || [],
        });
      } else {
        setForm({
          name: "", slug: "", owner_username: "", owner_password: "",
          owner_name: "", phone: "", address: "",
          start_date: "", end_date: "",
          perms: [...ALL_PERM_CODES],
        });
        setRole("all");
      }
    }
  }, [open, editData]);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // ── مدیریت تب‌ها ──
  const toggleExpand = (id) =>
    setExpanded((p) => ({ ...p, [id]: !(p[id] ?? true) }));

  const togglePerm = (code) => {
    setForm((f) => ({
      ...f,
      perms: f.perms.includes(code)
        ? f.perms.filter((p) => p !== code)
        : [...f.perms, code],
    }));
  };

  const toggleGroup = (groupCodes) => {
    setForm((f) => {
      const allOn = groupCodes.every((c) => f.perms.includes(c));
      return {
        ...f,
        perms: allOn
          ? f.perms.filter((p) => !groupCodes.includes(p))
          : [...new Set([...f.perms, ...groupCodes])],
      };
    });
  };

  const handleRoleChange = (key) => {
    setRole(key);
    if (key === "all") {
      setForm((f) => ({ ...f, perms: [...ALL_PERM_CODES] }));
    } else if (ROLE_PERM_PRESETS[key]) {
      setForm((f) => ({ ...f, perms: [...ROLE_PERM_PRESETS[key].perms] }));
    }
  };

  // ── ذخیره ──
  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        ...form,
        dashboard_permissions: form.perms,
      };
      if (editId) {
        await superClient.put(`/api/super/tenants/${editId}/`, payload);
      } else {
        await superClient.post(`/api/super/tenants/`, payload);
      }
      if (onSave) onSave();
      onClose();
    } catch (err) {
      console.error("Save tenant error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
            borderRadius: "20px",
          },
        },
      }}
    >
      {/* ═══ هدر ═══ */}
      <DialogTitle sx={{
        color: C.text, fontWeight: 800, fontSize: 17,
        borderBottom: `1px solid ${C.glassBorder}`,
      }}>
        {editId ? "✏️ ویرایش رستوران" : "➕ ساخت رستوران جدید"}
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5 }}>
        {/* ═══ اطلاعات اصلی ═══ */}
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text, mb: 1.5 }}>
          📋 اطلاعات اصلی
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField label="نام رستوران" value={form.name} onChange={set("name")} sx={fieldSx} />
          <TextField label="Slug (آدرس)" value={form.slug} onChange={set("slug")} disabled={!!editId} sx={fieldSx} />
          <TextField label="نام کاربری مالک" value={form.owner_username} onChange={set("owner_username")} disabled={!!editId} sx={fieldSx} />
          <TextField label="رمز عبور" type="password" value={form.owner_password} onChange={set("owner_password")}
            placeholder={editId ? "برای عدم تغییر خالی بگذارید" : ""} sx={fieldSx} />
          <TextField label="نام مالک" value={form.owner_name} onChange={set("owner_name")} sx={fieldSx} />
          <TextField label="تلفن" value={form.phone} onChange={set("phone")} sx={fieldSx} />
          <TextField label="آدرس" value={form.address} onChange={set("address")} multiline rows={2}
            sx={{ ...fieldSx, gridColumn: "1 / -1" }} />
        </Box>

        {/* ═══ تاریخ اشتراک ═══ */}
        <Box sx={{ bgcolor: C.oliveSubtle, borderRadius: "14px", p: 2, mt: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.olive, mb: 1.5 }}>
            📅 تاریخ اشتراک
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ flex: "1 1 200px" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mb: 0.5 }}>
                شروع
              </Typography>
              <input type="date" value={form.start_date} onChange={set("start_date")}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "12px",
                  border: `1px solid ${C.glassBorder}`, backgroundColor: C.inputBg,
                  fontSize: "13px", fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text, outline: "none", direction: "ltr", boxSizing: "border-box",
                }}
              />
            </Box>
            <Box sx={{ flex: "1 1 200px" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.sub, mb: 0.5 }}>
                پایان
              </Typography>
              <input type="date" value={form.end_date} onChange={set("end_date")}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "12px",
                  border: `1px solid ${C.glassBorder}`, backgroundColor: C.inputBg,
                  fontSize: "13px", fontFamily: "'Vazirmatn', sans-serif",
                  color: C.text, outline: "none", direction: "ltr", boxSizing: "border-box",
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* ═══════════════════════════════════════════ */}
        {/*   📌 تب‌ها و دسترسی‌ها (جدید)               */}
        {/* ═══════════════════════════════════════════ */}
        <Box sx={{ mt: 3 }}>
          {/* ── تیتر ── */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              🔐 تب‌ها و دسترسی‌ها
            </Typography>
            <Chip
              size="small"
              label={`${form.perms.length}/${ALL_PERM_CODES.length} فعال`}
              sx={{
                height: 24, fontSize: 11, fontWeight: 700,
                bgcolor: form.perms.length > 0 ? C.olive + "20" : C.muted + "20",
                color: form.perms.length > 0 ? C.olive : C.muted,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 11, color: C.sub, mb: 1.5 }}>
            تب‌هایی که این رستوران می‌تونه ببینه رو انتخاب کنید
          </Typography>

          {/* ── پروفایل‌های آماده ── */}
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <Chip clickable label="🟢 همه"
              onClick={() => handleRoleChange("all")}
              sx={{
                height: 34, fontSize: 12, fontWeight: 700, borderRadius: "10px",
                bgcolor: role === "all" ? "#4CAF50" : "#4CAF5015",
                color: role === "all" ? "#fff" : "#4CAF50",
                border: "1.5px solid #4CAF5040",
              }}
            />
            {Object.entries(ROLE_PERM_PRESETS).map(([key, preset]) => (
              <Chip key={key} clickable label={preset.label}
                onClick={() => handleRoleChange(key)}
                sx={{
                  height: 34, fontSize: 12, fontWeight: 700, borderRadius: "10px",
                  bgcolor: role === key ? C.olive : C.olive + "15",
                  color: role === key ? "#fff" : C.olive,
                  border: `1.5px solid ${C.olive}40`,
                }}
              />
            ))}
            <Chip clickable label="🧹 هیچ"
              onClick={() => { setForm((f) => ({ ...f, perms: [] })); setRole("none"); }}
              sx={{
                height: 34, fontSize: 12, fontWeight: 700, borderRadius: "10px",
                bgcolor: role === "none" ? "#E84057" : "#E8405715",
                color: role === "none" ? "#fff" : "#E84057",
                border: "1.5px solid #E8405740",
              }}
            />
          </Box>

          {/* ── دکمه‌های سریع ── */}
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <Button size="small" onClick={() => setForm((f) => ({ ...f, perms: [...ALL_PERM_CODES] }))}
              sx={{ fontSize: 11, color: C.olive, textTransform: "none", fontWeight: 700 }}>
              ☑ انتخاب همه
            </Button>
            <Button size="small" onClick={() => setForm((f) => ({ ...f, perms: [] }))}
              sx={{ fontSize: 11, color: C.danger, textTransform: "none", fontWeight: 700 }}>
              ☒ لغو همه
            </Button>
          </Box>

          {/* ── گروه‌های تب ── */}
          <Box sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "14px", overflow: "hidden" }}>
            {Object.entries(PERM_GROUPS).map(([groupName, group], gi) => {
              const groupCodes = group.codes.filter((c) => ALL_PERM_CODES.includes(c));
              const groupActive = groupCodes.filter((c) => form.perms.includes(c)).length;
              const groupAll = groupCodes.length > 0 && groupCodes.every((c) => form.perms.includes(c));
              const isOpen = expanded[groupName] ?? true;

              return (
                <Box key={groupName} sx={{
                  borderBottom: `1px solid ${C.glassBorder}`,
                  "&:last-child": { borderBottom: "none" },
                }}>
                  {/* هدر گروه */}
                  <Box
                    onClick={() => toggleGroup(groupCodes)}
                    sx={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      px: 2, py: 1.2, cursor: "pointer",
                      bgcolor: groupAll ? C.oliveSubtle : groupActive > 0 ? C.olive + "06" : "transparent",
                      "&:hover": { bgcolor: C.olive + "10" },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Checkbox
                        checked={groupAll}
                        indeterminate={groupActive > 0 && !groupAll}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleGroup(groupCodes)}
                        sx={{
                          color: C.muted,
                          "&.Mui-checked": { color: C.olive },
                          "&.MuiCheckbox-indeterminate": { color: C.olive },
                          p: 0.5,
                        }}
                      />
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: groupAll ? C.olive : C.text }}>
                        {group.icon} {groupName}
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Chip size="small" label={`${groupActive}/${groupCodes.length}`}
                        sx={{
                          height: 20, fontSize: 9, fontWeight: 700,
                          bgcolor: groupActive > 0 ? C.olive + "15" : C.muted + "15",
                          color: groupActive > 0 ? C.olive : C.muted,
                          borderRadius: "6px",
                        }}
                      />
                      <IconButton size="small"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(groupName); }}
                      >
                        {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    </Box>
                  </Box>

                  {/* آیتم‌های تب */}
                  <Collapse in={isOpen}>
                    <Box sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" },
                      gap: 0.8, px: 2, pb: 1.5, pt: 0.5,
                    }}>
                      {groupCodes.map((code) => {
                        const active = form.perms.includes(code);
                        return (
                          <Box key={code} onClick={() => togglePerm(code)}
                            sx={{
                              display: "flex", alignItems: "center", gap: 0.8,
                              px: 1, py: 0.7, borderRadius: "8px", cursor: "pointer",
                              bgcolor: active ? C.oliveSubtle : "transparent",
                              border: `1px solid ${active ? C.olive + "40" : C.glassBorder}`,
                              transition: "all 0.15s",
                              "&:hover": {
                                bgcolor: C.olive + "10",
                                borderColor: C.olive + "60",
                                transform: "translateY(-1px)",
                              },
                            }}
                          >
                            <Checkbox checked={active}
                              sx={{
                                color: C.muted,
                                "&.Mui-checked": { color: C.olive },
                                p: 0.3,
                                "& .MuiSvgIcon-root": { fontSize: 18 },
                              }}
                            />
                            <Typography sx={{
                              fontSize: 11,
                              color: active ? C.olive : C.sub,
                              fontWeight: active ? 700 : 400,
                              lineHeight: 1.3,
                            }}>
                              {PERM_LABELS[code] || code}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Box>
        </Box>
      </DialogContent>

      {/* ═══ دکمه‌ها ═══ */}
      <DialogActions sx={{
        px: 3, pb: 2.5, pt: 1.5,
        borderTop: `1px solid ${C.glassBorder}`,
      }}>
        <Button onClick={onClose} sx={{ color: C.sub, textTransform: "none", fontSize: 13 }}>
          انصراف
        </Button>
        <Button onClick={handleSave} disabled={loading}
          sx={{
            bgcolor: C.btnGrad, color: "#fff",
            fontWeight: 700, textTransform: "none",
            borderRadius: "12px", px: 4, fontSize: 13,
          }}>
          {loading ? "..." : "ذخیره"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}