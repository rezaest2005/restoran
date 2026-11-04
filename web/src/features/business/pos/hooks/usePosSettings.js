import { useState, useEffect, useCallback } from "react";

export default function usePosSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // The backend has no POS settings endpoint (removed with the old design):
    // use the built-in defaults silently instead of requesting a missing URL.
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(async (changes) => {
    // Kept in memory only (no backend endpoint).
    const next = { ...(settings || {}), ...changes };
    setSettings(next);
    return { success: true, settings: next };
  }, [settings]);

  return {
    settings,
    loading,
    update,
    reload: load,
    useDictionary: settings?.use_dictionary ?? true,
    showStock: settings?.show_stock ?? true,
    allowPriceEdit: settings?.allow_price_edit ?? false,
    requireCustomer: settings?.require_customer ?? false,
    defaultPayment: settings?.default_payment ?? "cash",
  };
}