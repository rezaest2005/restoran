import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, TextField, Table, TableHead, TableRow, TableCell, TableBody, Chip, Menu, MenuItem,
  ListItemIcon, ListItemText,
} from "@mui/material";
import { Dashboard, ArrowDropDown, LockOpen, Edit, Delete } from "@mui/icons-material";
import UserModal from "@super/users/UserModal";
import DeleteModal from "@super/common/DeleteModal";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import { ResponsiveTable, rsx } from "@shared/responsive";
import { withBase } from "@shared/basePath";
import superClient from "@super/api/super_client";

const personName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ");

export default function UsersPanel({ users, loadUsers, onChanged, C }) {
  const { t } = useTranslation();
  const [modal, setModal] = useState({ open: false, editId: null, tab: 0 });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: "" });
  const [menu, setMenu] = useState({ anchor: null, user: null });
  const [search, setSearch] = useState("");

  useEffect(() => { loadUsers(1, search); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { loadUsers(1, search); onChanged?.(); };

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
    { combo: "F2", label: t("shortcuts.new"), handler: () => setModal({ open: true, editId: null, tab: 0 }) },
  ]);

  const openMenu = (e, user) => setMenu({ anchor: e.currentTarget, user });
  const closeMenu = () => setMenu((m) => ({ ...m, anchor: null }));
  const pick = (fn) => () => { const u = menu.user; closeMenu(); fn(u); };

  const openDashboard = (u) => window.open(withBase(`/${u.slug}/bizsuite_dashboard/login`), "_blank", "noopener");

  // quick links first (open the customer's dashboard), then the Operations menu
  const actions = (u) => (
    <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
      <Button
        size="small" variant="outlined" onClick={() => openDashboard(u)} disabled={!u.slug}
        startIcon={<Dashboard fontSize="small" />} data-testid={`open-dashboard-${u.id}`}
        sx={{ minHeight: 40, textTransform: "none", fontWeight: 700, borderRadius: "10px", color: C.info || "var(--info)" }}
      >
        {t("super.action.dashboard")}
      </Button>
      <Button
        size="small" variant="outlined" onClick={(e) => openMenu(e, u)}
        endIcon={<ArrowDropDown />} aria-haspopup="menu" aria-expanded={menu.user?.id === u.id && !!menu.anchor}
        data-testid={`ops-${u.id}`}
        sx={{ minHeight: 40, textTransform: "none", fontWeight: 700, borderRadius: "10px", color: C.olive }}
      >
        {t("ui_c.super.users.actions")}
      </Button>
    </Box>
  );

  const role = <Chip label={t("ui_c.super.cust.role")} size="small" sx={{ flexShrink: 0 }} />;

  return (
    <Box>
      <Box sx={{ ...rsx.wrapRow, justifyContent: "space-between", gap: 1.5, mb: 2 }}>
        <Typography variant="h5" sx={{ color: C.text, fontSize: { xs: 18, md: 24 }, fontWeight: 800 }}>{t("ui_c.super.users.title")}</Typography>
        <Button
          onClick={() => setModal({ open: true, editId: null, tab: 0 })}
          sx={{ bgcolor: C.btnGrad, color: "var(--on-primary)", minHeight: 40 }}
        >
          {t("ui_c.super.users.new")}
        </Button>
      </Box>

      <Box sx={{ ...rsx.toolbar, mb: 2 }}>
        <TextField size="small" placeholder={t("ui_c.super.users.search")} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ bgcolor: C.inputBg, width: { sm: 260 } }} />
      </Box>

      <ResponsiveTable
        minWidth={640}
        sx={{ bgcolor: C.glass, borderRadius: 2, border: `1px solid ${C.glassBorder}` }}
        cards={(
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {users.map((u) => (
              <Box key={u.id} sx={{ bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ color: C.text, fontWeight: 700, ...rsx.wrapText }}>{personName(u) || u.username}</Typography>
                  {role}
                </Box>
                <Typography dir="ltr" sx={{ color: C.sub, fontSize: 13, textAlign: "start", ...rsx.wrapText }}>{u.username}</Typography>
                {u.phone_number && <Typography dir="ltr" sx={{ color: C.sub, fontSize: 13, textAlign: "start", mb: 0.5 }}>{u.phone_number}</Typography>}
                <Box sx={{ mt: 1 }}>{actions(u)}</Box>
              </Box>
            ))}
            {users.length === 0 && <Box sx={{ textAlign: "center", color: C.muted, py: 4 }}>{t("ui_c.super.cust.empty")}</Box>}
          </Box>
        )}
      >
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: C.tableHeaderBg }}>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.cust.col_name")}</TableCell>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.user.username")}</TableCell>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.user.phone")}</TableCell>
            <TableCell sx={{ color: C.sub }}>{t("ui_c.super.cust.role")}</TableCell>
            <TableCell sx={{ color: C.sub, textAlign: "end" }}>{t("ui_c.super.users.actions")}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ color: C.text, fontWeight: 600 }}>{personName(u) || "—"}</TableCell>
                <TableCell dir="ltr" sx={{ color: C.text, textAlign: "start" }}>{u.username}</TableCell>
                <TableCell dir="ltr" sx={{ color: C.sub, textAlign: "start" }}>{u.phone_number || "—"}</TableCell>
                <TableCell>{role}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap", "& > div": { justifyContent: "flex-end", flexWrap: "nowrap" } }}>{actions(u)}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow><TableCell colSpan={5} sx={{ textAlign: "center", color: C.muted, py: 4, border: "none" }}>{t("ui_c.super.cust.empty")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ResponsiveTable>

      <Menu
        anchorEl={menu.anchor}
        open={!!menu.anchor}
        onClose={closeMenu}
        slotProps={{ paper: { sx: { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, minWidth: 170 } } }}
      >
        <MenuItem sx={{ minHeight: 40 }} onClick={pick((u) => setModal({ open: true, editId: u.id, tab: 1 }))} data-testid="op-access">
          <ListItemIcon sx={{ color: C.olive, minWidth: 36 }}><LockOpen fontSize="small" /></ListItemIcon>
          <ListItemText>{t("ui_c.super.users.perms")}</ListItemText>
        </MenuItem>
        <MenuItem sx={{ minHeight: 40 }} onClick={pick((u) => setModal({ open: true, editId: u.id, tab: 0 }))} data-testid="op-edit">
          <ListItemIcon sx={{ color: C.olive, minWidth: 36 }}><Edit fontSize="small" /></ListItemIcon>
          <ListItemText>{t("ui_c.super.users.edit")}</ListItemText>
        </MenuItem>
        <MenuItem sx={{ minHeight: 40, color: C.danger }} onClick={pick((u) => setDeleteModal({ open: true, id: u.id, name: u.username }))} data-testid="op-delete">
          <ListItemIcon sx={{ color: C.danger, minWidth: 36 }}><Delete fontSize="small" /></ListItemIcon>
          <ListItemText>{t("ui_c.super.users.delete")}</ListItemText>
        </MenuItem>
      </Menu>

      <UserModal
        open={modal.open}
        editId={modal.editId}
        initialTab={modal.tab}
        onClose={(saved) => { setModal({ open: false, editId: null, tab: 0 }); if (saved) refresh(); }}
        C={C}
      />
      <DeleteModal open={deleteModal.open} name={deleteModal.name} onClose={() => setDeleteModal({ open: false, id: null, name: "" })} onConfirm={handleDeleteUser} C={C} />
    </Box>
  );
}
