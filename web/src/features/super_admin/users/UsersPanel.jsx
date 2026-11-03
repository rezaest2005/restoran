import { useState, useEffect } from "react";
import { Box, Typography, Button, TextField, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Chip, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import UserModal from "@super/users/UserModal";
import PermsModal from "@super/users/PermsModal";
import DeleteModal from "@super/common/DeleteModal";
import { ROLE_OPTIONS } from "@super/common/superConfig";
import { useRegisteredShortcuts, dialogBindings, tabBindings, helpBinding, collectShortcuts } from "@shared/common/shortcutKit";
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

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h5" sx={{ color: C.text }}>{t("ui_c.super.users.title")}</Typography>
        <Button onClick={() => setModal({ open: true, editId: null })} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>{t("ui_c.super.users.new")}</Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <TextField size="small" placeholder={t("ui_c.super.users.search")} value={search} onChange={e => setSearch(e.target.value)} sx={{ bgcolor: C.inputBg }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>{t("ui_c.super.users.role")}</InputLabel>
          <Select value={role} onChange={e => setRole(e.target.value)} label={t("ui_c.super.users.role")}>
            <MenuItem value="">{t("ui_c.super.users.all")}</MenuItem>
            {ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value}>{t(r.labelKey)}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <TableContainer sx={{ bgcolor: C.glass, borderRadius: 2, border: `1px solid ${C.glassBorder}` }}>
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
                <TableCell sx={{ color: C.sub }}>{u.restaurant_name || "—"}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setPermsModal({ open: true, userId: u.id })} sx={{ color: C.olive }}>{t("ui_c.super.users.perms")}</Button>
                  <Button size="small" onClick={() => setModal({ open: true, editId: u.id })} sx={{ color: C.olive }}>{t("ui_c.super.users.edit")}</Button>
                  <Button size="small" onClick={() => setDeleteModal({ open: true, id: u.id, name: u.username })} sx={{ color: C.danger }}>{t("ui_c.super.users.delete")}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <UserModal open={modal.open} editId={modal.editId} onClose={() => { setModal({ open: false, editId: null }); refresh(); }} tenants={tenants} C={C} />
      <PermsModal open={permsModal.open} userId={permsModal.userId} onClose={() => { setPermsModal({ open: false, userId: null }); refresh(); }} C={C} />
      <DeleteModal open={deleteModal.open} type="user" name={deleteModal.name} onClose={() => setDeleteModal({ open: false, id: null, name: "" })} onConfirm={handleDeleteUser} C={C} />
    </Box>
  );
}