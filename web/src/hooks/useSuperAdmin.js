// src/hooks/useSuperAdmin.js
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import superClient from "../api/super_client";

export const useSuperAdmin = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPages, setUsersPages] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  const showToast = useCallback((message, type = "info") => setToast({ open: true, message, type }), []);

  const loadStats = useCallback(async () => {
    try { const { data } = await superClient.get("/api/super/stats/"); setStats(data); } 
    catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); }
  }, [navigate]);

  const loadTenants = useCallback(async () => {
    try { const { data } = await superClient.get("/api/super/tenants/"); setTenants(data.tenants || []); } 
    catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); }
  }, [navigate]);

  const loadServices = useCallback(async (tenantId) => {
    setServicesLoading(true);
    try { const { data } = await superClient.get(`/api/super/tenants/${tenantId}/services/`); setServices(data.services || []); } 
    catch { showToast(t("super.error.load_services"), "error"); } 
    finally { setServicesLoading(false); }
  }, [showToast, t]);

  const loadUsers = useCallback(async (page = 1, search = "", restId = "", role = "") => {
    setUsersLoading(true); setUsersPage(page);
    try {
      let params = `?page=${page}`;
      if (search) params += `&search=${encodeURIComponent(search)}`;
      if (restId) params += `&restaurant_id=${restId}`;
      if (role) params += `&role=${role}`;
      const { data } = await superClient.get(`/api/super/users/${params}`);
      setUsers(data.users || []); setUsersPages(data.pages || 1);
    } catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); } 
    finally { setUsersLoading(false); }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [statsRes, tenantsRes] = await Promise.all([ superClient.get("/api/super/stats/"), superClient.get("/api/super/tenants/") ]);
        if (!cancelled) { setStats(statsRes.data); setTenants(tenantsRes.data.tenants || []); }
      } catch (err) { if (err.response?.status === 401 || err.response?.status === 403) navigate("/super/login"); }
    };
    loadData();
    return () => { cancelled = true; };
  }, [navigate]);

  return {
    stats, tenants, services, servicesLoading, loadServices, loadTenants, loadStats,
    users, usersPage, usersPages, usersLoading, loadUsers,
    toast, showToast, setToast
  };
};