import { useState, useEffect, useCallback } from "react";
import { testConnection } from "../api/paymentApi";

export default function usePaymentConfig(enabled = false) {
  const [gateways, setGateways] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    // /api/payment/config/ was removed from the backend: nothing to load, no request.
    setGateways([]);
    setTerminals([]);
    setLoading(false);
  }, []);

  // ★ فقط وقتی enabled=true صدا بزن
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(async (data) => {
    // No backend endpoint for payment config any more.
    setSaving(false);
    return false;
  }, []);

  const remove = useCallback(async (type, id) => {
    return false;
  }, []);

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