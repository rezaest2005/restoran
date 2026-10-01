import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Checkbox, IconButton,
  Chip, TextField, CircularProgress,
} from "@mui/material";
import superClient from "@super/api/super_client";
import {
  ALL_PERM_CODES,
  PERM_LABELS,
  PERM_GROUPS,
  ROLE_PERM_PRESETS,
} from "@super/shared/superConfig";

export default function PermsModal({ open, onClose, userId, C }) {
  const [username, setUsername] = useState("");
  const [perms, setPerms] = useState([]);
  const [role, setRole] = useState("other");
  const [customRole, setCustomRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && userId) {
      setLoading(true);
      superClient.get(`/api/super/users/${userId}/`).then((res) => {
        setUsername(res.data.username);
        const loadedPerms = res.data.effective_permissions || res.data.dashboard_permissions || [];
        setPerms(loadedPerms);

        const userRole = res.data.role || "other";
        const isPreset = Object.keys(ROLE_PERM_PRESETS).includes(userRole);
        setRole(isPreset ? userRole : "other");
        setCustomRole(isPreset ? "" : (res.data.role_display || userRole));
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [open, userId]);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    const preset = ROLE_PERM_PRESETS[newRole];
    if (preset) setPerms([...preset.perms]);
    if (newRole !== "other") setCustomRole("");
  };

  const togglePerm = (code) => {
    setPerms((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  };

  const toggleGroup = (groupCodes) => {
    const allOn = groupCodes.every((c) => perms.includes(c));
    setPerms((prev) => {
      if (allOn) return prev.filter((p) => !groupCodes.includes(p));
      return [...new Set([...prev, ...groupCodes])];
    });
  };

  const savePerms = async () => {
    setSaving(true);
    try {
      const finalRole = role === "other" ? (customRole.trim().toLowerCase() || "other") : role;

      await superClient.put(`/api/super/users/${userId}/`, { role: finalRole });
      await superClient.put(`/api/super/users/${userId}/permissions/`, { dashboard_permissions: perms });

      onClose();
    } catch (err) {
      console.error("Save perms error:", err);
    } finally {
      setSaving(false);
    }
  };

  const activeCount = perms.length;
  const totalCount = ALL_PERM_CODES.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: C.glass,
            border: `1px solid ${C.glassBorder}`,
            borderRadius: "16px",
          },
        },
      }}
    >
      {/* ── هدر ── */}
      <DialogTitle
        sx={{
          color: C.text,
          fontWeight: 800,
          fontSize: 16,
          borderBottom: `1px solid ${C.glassBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: 18 }}>🔐</Typography>
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              دسترسی‌ها — {username}
            </Typography>
            <Typography sx={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>
              {activeCount} از {totalCount} دسترسی فعال
            </Typography>
          </Box>
        </Box>
        <Chip
          size="small"
          label={`${activeCount}/${totalCount}`}
          sx={{
            height: 24,
            fontSize: 11,
            fontWeight: 700,
            bgcolor: activeCount > 0 ? C.olive + "20" : C.muted + "20",
            color: activeCount > 0 ? C.olive : C.muted,
          }}
        />
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={32} sx={{ color: C.olive }} />
          </Box>
        ) : (
          <>
            {/* ── انتخاب نقش ── */}
            <Box
              sx={{
                p: 2,
                borderRadius: "12px",
                border: `1px solid ${C.glassBorder}`,
                bgcolor: C.oliveSubtle,
                mb: 2,
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>
                🎭 نقش / شغل
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                {Object.entries(ROLE_PERM_PRESETS).map(([key, preset]) => (
                  <Box
                    key={key}
                    onClick={() => handleRoleChange(key)}
                    sx={{
                      px: 1.5,
                      py: 0.8,
                      borderRadius: "10px",
                      cursor: "pointer",
                      border: `1px solid ${role === key ? C.olive : C.glassBorder}`,
                      bgcolor: role === key ? C.olive + "15" : "transparent",
                      transition: "all 0.15s",
                      "&:hover": { bgcolor: C.olive + "10" },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: role === key ? 700 : 500,
                        color: role === key ? C.olive : C.sub,
                      }}
                    >
                      {preset.label}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {role !== "other" && ROLE_PERM_PRESETS[role] && (
                <Typography sx={{ fontSize: 11, color: C.muted }}>
                  📌 {ROLE_PERM_PRESETS[role].description}
                </Typography>
              )}

              {role === "other" && (
                <TextField
                  size="small"
                  fullWidth
                  label="نام شغل سفارشی"
                  placeholder="مثلاً: منشی، حسابدار، نظافتچی..."
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  sx={{
                    mt: 1,
                    "& .MuiOutlinedInput-root": { bgcolor: C.inputBg, borderRadius: "10px", fontSize: 13 },
                    "& .MuiInputLabel-root": { fontSize: 12 },
                  }}
                />
              )}
            </Box>

            {/* ── دسترسی‌ها ── */}
            <Box sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", overflow: "hidden" }}>
              {Object.entries(PERM_GROUPS).map(([groupName, group], gi) => {
                const groupCodes = group.codes.filter((c) => ALL_PERM_CODES.includes(c));
                const groupActive = groupCodes.filter((c) => perms.includes(c)).length;
                const groupAll = groupCodes.every((c) => perms.includes(c));

                return (
                  <Box
                    key={groupName}
                    sx={{
                      borderBottom: `1px solid ${C.glassBorder}`,
                      "&:last-child": { borderBottom: "none" },
                      opacity: 0,
                      animation: `permFadeUp 0.3s ease-out ${gi * 0.05}s forwards`,
                    }}
                  >
                    {/* هدر گروه */}
                    <Box
                      onClick={() => toggleGroup(groupCodes)}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        px: 2,
                        py: 1,
                        cursor: "pointer",
                        bgcolor: groupAll ? C.oliveSubtle : groupActive > 0 ? C.olive + "06" : "transparent",
                        transition: "all 0.15s",
                        "&:hover": { bgcolor: C.olive + "10" },
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Checkbox
                          checked={groupAll}
                          indeterminate={groupActive > 0 && !groupAll}
                          sx={{
                            color: C.muted,
                            "&.Mui-checked": { color: C.olive },
                            "&.MuiCheckbox-indeterminate": { color: C.olive },
                            p: 0.5,
                          }}
                        />
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: groupAll ? C.olive : C.text }}>
                          {groupName}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={`${groupActive}/${groupCodes.length}`}
                        sx={{
                          height: 18, fontSize: 9, fontWeight: 700,
                          bgcolor: groupActive > 0 ? C.olive + "15" : C.muted + "15",
                          color: groupActive > 0 ? C.olive : C.muted,
                          borderRadius: "5px",
                        }}
                      />
                    </Box>

                    {/* آیتم‌ها */}
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" },
                        gap: 0.8,
                        px: 2,
                        pb: 1.5,
                        pt: 0.5,
                      }}
                    >
                      {groupCodes.map((code) => {
                        const active = perms.includes(code);
                        return (
                          <Box
                            key={code}
                            onClick={() => togglePerm(code)}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.8,
                              px: 1,
                              py: 0.6,
                              borderRadius: "8px",
                              cursor: "pointer",
                              bgcolor: active ? C.oliveSubtle : "transparent",
                              border: `1px solid ${active ? C.olive + "40" : C.glassBorder}`,
                              transition: "all 0.15s",
                              "&:hover": { bgcolor: C.olive + "10", borderColor: C.olive + "60" },
                            }}
                          >
                            <Checkbox
                              checked={active}
                              sx={{
                                color: C.muted,
                                "&.Mui-checked": { color: C.olive },
                                p: 0.3,
                                "& .MuiSvgIcon-root": { fontSize: 18 },
                              }}
                            />
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: active ? C.olive : C.sub,
                                fontWeight: active ? 600 : 400,
                                lineHeight: 1.3,
                              }}
                            >
                              {PERM_LABELS[code] || code}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </DialogContent>

      {/* ── دکمه‌ها ── */}
      <DialogActions
        sx={{
          px: 3,
          pb: 2.5,
          pt: 1.5,
          borderTop: `1px solid ${C.glassBorder}`,
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            onClick={() => setPerms([...ALL_PERM_CODES])}
            size="small"
            sx={{ fontSize: 11, color: C.olive, textTransform: "none", fontWeight: 600 }}
          >
            ☑ همه
          </Button>
          <Button
            onClick={() => setPerms([])}
            size="small"
            sx={{ fontSize: 11, color: C.danger, textTransform: "none", fontWeight: 600 }}
          >
            ☐ هیچ
          </Button>
        </Box>

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            onClick={onClose}
            sx={{ color: C.sub, textTransform: "none", borderRadius: "10px", fontSize: 12 }}
          >
            انصراف
          </Button>
          <Button
            onClick={savePerms}
            disabled={saving || (role === "other" && !customRole.trim())}
            sx={{
              bgcolor: C.btnGrad,
              color: "#fff",
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "10px",
              px: 3,
              fontSize: 12,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <CircularProgress size={18} sx={{ color: "#fff" }} />
            ) : (
              "ذخیره"
            )}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

/* ── انیمیشن ── */
if (typeof document !== "undefined" && !document.getElementById("perm-fadeup-style")) {
  const s = document.createElement("style");
  s.id = "perm-fadeup-style";
  s.textContent = `@keyframes permFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(s);
}