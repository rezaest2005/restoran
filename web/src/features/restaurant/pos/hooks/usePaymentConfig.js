import { useState, useEffect, useCallback } from "react";
import {
  fetchPaymentConfig, savePaymentConfig,
  deletePaymentConfig, testConnection,
} from "../api/paymentApi";

export default function usePaymentConfig(enabled = false) {
  const [gateways, setGateways] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchPaymentConfig();
      setGateways(res.gateways || []);
      setTerminals(res.terminals || []);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) {
        console.warn("Payment config: unauthorized");
      } else {
        console.error("Failed to load payment config:", e);
      }
      setGateways([]);
      setTerminals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ★ فقط وقتی enabled=true صدا بزن
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(async (data) => {
    setSaving(true);
    try {
      await savePaymentConfig(data);
      await load();
      return true;
    } catch (e) {
      console.error("Save failed:", e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (type, id) => {
    try {
      await deletePaymentConfig(type, id);
      await load();
      return true;
    } catch (e) {
      console.error("Delete failed:", e);
      return false;
    }
  }, [load]);

  const test = useCallback(async (type, id) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await testConnection(type, id);
      setTestResult(res);
      return res;
    } catch (e) {
      const fail = { ok: false, message: "خطا در اتصال" };
      setTestResult(fail);
      return fail;
    } finally {
      setTimeout(() => { setTesting(null); setTestResult(null); }, 5000);
    }
  }, []);

  return {
    gateways, terminals, loading, saving, testing, testResult,
    load, save, remove, test,
  };
}