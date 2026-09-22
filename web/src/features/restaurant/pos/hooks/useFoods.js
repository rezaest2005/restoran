import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchFoods, fetchCategories } from "../api";
import client from "../../api/client";

const api = {
  post: (path, body) => client.post(path, body).then((r) => r.data),
};

export default function useFoods(useDictionary, isRtl) {
  const [foods, setFoods] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");

  const catField = isRtl === false ? "category_name_en" : "category_name";

  const load = useCallback(async () => {
    if (!useDictionary) {
      setFoods([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [foodsRes, catsRes] = await Promise.all([
        fetchFoods(),
        fetchCategories(),
      ]);
      setFoods(foodsRes || []);
      setCategories(catsRes || []);
    } catch (err) {
      console.error("Failed to load foods:", err);
    } finally {
      setLoading(false);
    }
  }, [useDictionary]);

  useEffect(() => { load(); }, [load]);

  // ★ موجودی یه آیتم خاص رو آپدیت کن (هم local هم API)
  const updateStock = useCallback(async (foodId, newStock) => {
    const stock = Math.max(0, Number(newStock) || 0);
    setFoods((prev) =>
      prev.map((f) => (f.id === foodId ? { ...f, stock } : f))
    );
    try {
      await api.post(`/api/dictionary/food/${foodId}/update/`, { stock });
    } catch (err) {
      console.error("Stock update failed:", err);
      await load();
    }
  }, [load]);

  // ★ کم کدن موجودی هنگام افزودن به سبد
  const decreaseStock = useCallback(async (foodId, qty = 1) => {
    let newStock;
    setFoods((prev) =>
      prev.map((f) => {
        if (f.id !== foodId) return f;
        const current = Number(f.stock) || 0;
        newStock = Math.max(0, current - qty);
        return { ...f, stock: newStock };
      })
    );
    if (newStock !== undefined) {
      try {
        await api.post(`/api/dictionary/food/${foodId}/update/`, { stock: newStock });
      } catch (err) {
        console.error("Stock update failed:", err);
        await load();
      }
    }
  }, [load]);

  // ★ افزایش موجودی هنگام حذف از سبد
  const increaseStock = useCallback(async (foodId, qty = 1) => {
    let newStock;
    setFoods((prev) =>
      prev.map((f) => {
        if (f.id !== foodId) return f;
        const current = Number(f.stock) || 0;
        newStock = current + qty;
        return { ...f, stock: newStock };
      })
    );
    if (newStock !== undefined) {
      try {
        await api.post(`/api/dictionary/food/${foodId}/update/`, { stock: newStock });
      } catch (err) {
        console.error("Stock restore failed:", err);
        await load();
      }
    }
  }, [load]);

  const filteredFoods = useMemo(() => {
    return foods.filter((f) => {
      const matchCat = activeCat === "all" || f[catField] === activeCat;
      const matchSearch =
        !search ||
        f.name.includes(search) ||
        (f.name_en || "").toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [foods, activeCat, search, catField]);

  const categoryNames = useMemo(() => {
    if (categories.length > 0) {
      const names = categories.map((c) =>
        typeof c === "string" ? c : c.name || c.title || String(c)
      );
      return ["all", ...names];
    }
    return ["all", ...new Set(foods.map((f) => f[catField]).filter(Boolean))];
  }, [categories, foods, catField]);

  return {
    foods: filteredFoods,
    allFoods: foods,
    categories,
    categoryNames,
    loading,
    search,
    setSearch,
    activeCat,
    setActiveCat,
    reload: load,
    decreaseStock,
    increaseStock,
    updateStock,
  };
} 