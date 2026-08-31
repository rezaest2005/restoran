
import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // ★ بررسی لاگین
  const token = localStorage.getItem("access_token");
  const auth = localStorage.getItem("db_auth");
  if (!token || !auth) return <Navigate to="/login" replace />;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <Box sx={{
        flex: 1, display: "flex", flexDirection: "column",
        minWidth: 0, transition: "margin 0.3s ease",
      }}>
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <Box sx={{ flex: 1, p: { xs: 1.5, sm: 3 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
