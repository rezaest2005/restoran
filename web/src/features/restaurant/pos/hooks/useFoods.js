import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchFoods, fetchCategories } from "../api";

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

  const filteredFoods = useMemo(() => {
    return foods.filter(f => {
      const matchCat = activeCat === "all" || f[catField] === activeCat;
      const matchSearch = !search || f.name.includes(search) || (f.name_en || "").toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [foods, activeCat, search, catField]);

  const categoryNames = useMemo(() => {
    if (categories.length > 0) {
      const names = categories.map(c => typeof c === "string" ? c : c.name || c.title || String(c));
      return ["all", ...names];
    }
    return ["all", ...new Set(foods.map(f => f[catField]).filter(Boolean))];
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
  };
}