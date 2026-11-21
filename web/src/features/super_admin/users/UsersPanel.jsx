import { useState, useEffect } from "react";
import { Box, Typography, Button, TextField, Table, TableHead, TableRow, TableCell, TableBody, Chip, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import UserModal from "@super/users/UserModal";
import PermsModal from "@super/users/PermsModal";
import DeleteModal from "@super/common/DeleteModal";
import { ROLE_OPTIONS } from "@super/common/superConfig";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import { ResponsiveTable, rsx } from "@shared/responsive";
import superClient from "@super/api/super_client";

export default function UsersPanel({ users, tenants, loadUsers, C, t }) {
  const [modal, setModal] = useState({ open: false, editId: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: "" });
  const [permsModal, setPermsModal] = useState({ open: false, userId: null });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => { loadUsers(1, search, "", role); }, [search, role]);

  const refresh = () => loadUsers(1, search, "", role);

  const handleDeleteUser = async () => {
    try {
      await superClient.delete(`/api/super/users/${deleteModal.id}/`);
    } catch (err) {
      console.error("Delete user error:", err);
    }
    setDeleteModal({ open: false, id: null, name: "" });
    refresh();
  };

  // میان‌برها
  useRegisteredShortcuts([
    { combo: "F2", label: t("shortcuts.new"), handler: () => setModal({ open: true, editId: null }) },
  ]);

  const actions = (u) => (
    <>
      <Button size="small" onClick={() => setPermsModal({ open: true, userId: u.id })} sx={{ color: C.olive }}>{t("ui_c.super.users.perms")}</Button>
      <Button size="small" onClick={() => setModal({ open: true, editId: u.id })} sx={{ color: C.olive }}>{t("ui_c.super.users.edit")}</Button>
      <Button size="small" onClick={() => setDeleteModal({ open: true, id: u.id, name: u.username })} sx={{ color: C.danger }}>{t("ui_c.super.users.delete")}</Button>
    </>
  );

  return (
    <Box>
      <Box sx={{ ...rsx.wrapRow, justifyContent: "space-between", gap: 1.5, mb: 2 }}>
        <Typography variant="h5" sx={{ color: C.text, fontSize: { xs: 18, md: 24 }, fontWeight: 800 }}>{t("ui_c.super.users.title")}</Typography>
        <Button onClick={() => setModal({ open: true, editId: null })} sx={{ bgcolor: C.btnGrad, color: "var(--on-primary)" }}>{t("ui_c.super.users.new")}</Button>
      </Box>

      <Box sx={{ ...rsx.toolbar, mb: 2 }}>
        <TextField size="small" placeholder={t("ui_c.super.users.search")} value={search} onChange={e => setSearch(e.target.value)} sx={{ bgcolor: C.inputBg, width: { sm: 260 } }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>{t("ui_c.super.users.role")}</InputLabel>
          <Select value={role} onChange={e => setRole(e.target.value)} label={t("ui_c.super.users.role")}>
            <MenuItem value="">{t("ui_c.super.users.all")}</MenuItem>
            {ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value}>{t(r.labelKey)}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <ResponsiveTable
        minWidth={600}
        sx={{ bgcolor: C.glass, borderRadius: 2, border: `1px solid ${C.glassBorder}` }}
        cards={(
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {users.map(u => (
              <Box key={u.id} sx={{ bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ color: C.text, fontWeight: 700, ...rsx.wrapText }}>{u.username}</Typography>
                  <Chip label={u.role} size="small" sx={{ flexShrink: 0 }} />
                </Box>
                <Typography sx={{ color: C.sub, fontSize: 13, mb: 1, ...rsx.wrapText }}>{u.business_name || "—"}</Typography>
                <Box sx={{ ...rsx.wrapRow, justifyContent: "flex-end", "& .MuiButton-root": { minHeight: 40 } }}>
                  {actions(u)}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      >
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: C.tableHeaderBg }}>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.user.username")}</TableCell>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.users.role")}</TableCell>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.user.tenant")}</TableCell>
            <TableCell align="right" sx={{ color: C.sub }}>{t("ui_c.super.users.actions")}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ color: C.text, fontWeight: 600 }}>{u.username}</TableCell>
                <TableCell><Chip label={u.role} size="small" /></TableCell>
                <TableCell sx={{ color: C.sub }}>{u.business_name || "—"}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{actions(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResponsiveTable>

      <UserModal open={modal.open} editId={modal.editId} onClose={() => { setModal({ open: false, editId: null }); refresh(); }} tenants={tenants} C={C} />
      <PermsModal open={permsModal.open} userId={permsModal.userId} onClose={() => { setPermsModal({ open: false, userId: null }); refresh(); }} C={C} />
      <DeleteModal open={deleteModal.open} type="user" name={deleteModal.name} onClose={() => setDeleteModal({ open: false, id: null, name: "" })} onConfirm={handleDeleteUser} C={C} />
    </Box>
  );
}