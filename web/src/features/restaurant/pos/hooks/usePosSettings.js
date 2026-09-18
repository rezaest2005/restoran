import { useState, useEffect, useCallback } from "react";
import { fetchPosSettings, updatePosSettings } from "../api";

export default function usePosSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchPosSettings();
      if (res.success) setSettings(res.settings);
    } catch (err) {
      console.error("Failed to load POS settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(async (changes) => {
    try {
      const res = await updatePosSettings(changes);
      if (res.success) {
        setSettings(res.settings);
        return res;
      }
    } catch (err) {
      console.error("Failed to update POS settings:", err);
    }
  }, []);

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