import { useState, useEffect } from "react";
import { Box, Typography, Button, TextField, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Chip, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import UserModal from "../../components/super/UserModal";
import PermsModal from "../../components/super/PermsModal";
import DeleteModal from "../../components/super/DeleteModal";
import { ROLE_OPTIONS } from "../../theme/superConfig";

export default function UsersPanel({ users, tenants, loadUsers, C, t }) {
  const [modal, setModal] = useState({ open: false, editId: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: "" });
  const [permsModal, setPermsModal] = useState({ open: false, userId: null });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => { loadUsers(1, search, "", role); }, [search, role]);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h5" sx={{ color: C.text }}>کاربران</Typography>
        <Button onClick={() => setModal({ open: true, editId: null })} sx={{ bgcolor: C.btnGrad, color: "#fff" }}>کاربر جدید</Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <TextField size="small" placeholder="جستجو..." value={search} onChange={e => setSearch(e.target.value)} sx={{ bgcolor: C.inputBg }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>نقش</InputLabel>
          <Select value={role} onChange={e => setRole(e.target.value)} label="نقش">
            <MenuItem value="">همه</MenuItem>
            {ROLE_OPTIONS.map(r => <MenuItem key={r.value} value={r.value}>{t(r.labelKey)}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <TableContainer sx={{ bgcolor: C.glass, borderRadius: 2, border: `1px solid ${C.glassBorder}` }}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: C.tableHeaderBg }}>
            <TableCell sx={{ color: C.sub }}>نام کاربری</TableCell>
            <TableCell sx={{ color: C.sub }}>نقش</TableCell>
            <TableCell sx={{ color: C.sub }}>رستوران</TableCell>
            <TableCell align="right" sx={{ color: C.sub }}>عملیات</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ color: C.text, fontWeight: 600 }}>{u.username}</TableCell>
                <TableCell><Chip label={u.role} size="small" /></TableCell>
                <TableCell sx={{ color: C.sub }}>{u.restaurant_name || "—"}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setPermsModal({ open: true, userId: u.id })} sx={{ color: C.olive }}>دسترسی‌ها</Button>
                  <Button size="small" onClick={() => setModal({ open: true, editId: u.id })} sx={{ color: C.olive }}>ویرایش</Button>
                  <Button size="small" onClick={() => setDeleteModal({ open: true, id: u.id, name: u.username })} sx={{ color: C.danger }}>حذف</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <UserModal open={modal.open} editId={modal.editId} onClose={() => setModal({ open: false, editId: null })} tenants={tenants} C={C} />
      <PermsModal open={permsModal.open} userId={permsModal.userId} onClose={() => setPermsModal({ open: false, userId: null })} C={C} />
      <DeleteModal open={deleteModal.open} type="user" name={deleteModal.name} onClose={() => setDeleteModal({ open: false, id: null, name: "" })} C={C} />
    </Box>
  );
}