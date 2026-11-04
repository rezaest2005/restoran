import { useState, useEffect, useCallback, useMemo } from "react";
import client from "../../api/client";

export default function useFoods(useDictionary, isRtl) {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");

  const catField = isRtl === false ? "category_name_en" : "category_name";

  const load = useCallback(async () => {
    if (!useDictionary) {
      setFoods([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // فراخوانی لیست غذاها از API بک‌اند
      const res = await client.get("/api/dictionary/foods/");
      const data = res.data?.items || [];
      setFoods(data);
    } catch (err) {
      console.error("Failed to load foods:", err);
    } finally {
      setLoading(false);
    }
  }, [useDictionary]);

  useEffect(() => { load(); }, [load]);

  // ★ آپدیت قیمت و موجودی (فقط در حالت ویرایش FoodCard استفاده می‌شود)
  const updateFoodData = useCallback(async (foodId, data) => {
    // آپدیت آپتیمیستیک (اول UI آپدیت شود تا سریع باشد)
    setFoods((prev) =>
      prev.map((f) => (f.id === foodId ? { ...f, ...data } : f))
    );
    try {
      await client.post(`/api/dictionary/food/${foodId}/update/`, data);
    } catch (err) {
      console.error("Food update failed:", err);
      await load(); // در صورت خطا، داده‌های اصلی از سرور دوباره لود شوند
    }
  }, [load]);

  // ★ کاهش موجودی فقط در UI (برای سرعت بالا هنگام زدن دکمه +)
  const decreaseStock = useCallback((foodId, qty = 1) => {
    setFoods((prev) =>
      prev.map((f) => {
        if (f.id !== foodId) return f;
        const current = Number(f.stock) || 0;
        return { ...f, stock: Math.max(0, current - qty) };
      })
    );
  }, []);

  // ★ افزایش موجودی فقط در UI (هنگام زدن دکمه - یا حذف از سبد)
  const increaseStock = useCallback((foodId, qty = 1) => {
    setFoods((prev) =>
      prev.map((f) => {
        if (f.id !== foodId) return f;
        const current = Number(f.stock) || 0;
        return { ...f, stock: current + qty };
      })
    );
  }, []);

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

  // استخراج دسته‌بندی‌ها از داخل لیست غذاها
  const categoryNames = useMemo(() => {
    const names = new Set(foods.map((f) => f[catField]).filter(Boolean));
    return ["all", ...Array.from(names)];
  }, [foods, catField]);

  return {
    foods: filteredFoods,
    allFoods: foods,
    categories: categoryNames,
    categoryNames,
    loading,
    search,
    setSearch,
    activeCat,
    setActiveCat,
    reload: load,
    decreaseStock,
    increaseStock,
    // تابع آپدیت برای استفاده در Edit Mode
    updateStock: (id, stock) => updateFoodData(id, { stock }),
    updatePrice: (id, price, final_price) => updateFoodData(id, { price, final_price }),
  };
}