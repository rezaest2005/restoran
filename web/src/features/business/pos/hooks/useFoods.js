import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchProducts, fetchCategories, updateProduct } from "../api";
import usePolling from "../common/usePolling";

const REFRESH_MS = 15000;

/**
 * Products come from the shared catalog; stock is the server's effective stock
 * (linked inventory item or legacy counter) and is refreshed every 15 s while
 * the tab is visible so all terminals stay in step.
 */
export default function useFoods(useDictionary, isRtl) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const ctrlRef = useRef(null);

  const catField = isRtl === false ? "category_name_en" : "category_name";

  const load = useCallback(async () => {
    if (!useDictionary) {
      setProducts([]);
      setLoading(false);
      return;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const [prods, cats] = await Promise.all([
        fetchProducts(ctrl.signal),
        fetchCategories(ctrl.signal),
      ]);
      if (ctrl.signal.aborted) return;
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      if (ctrl.signal.aborted || err?.code === "ERR_CANCELED") return;
      console.error("Failed to load products:", err);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [useDictionary]);

  usePolling(load, REFRESH_MS, !!useDictionary);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  // Catalog product -> POS food (adds the category name keys the cart/discounts use).
  const foods = useMemo(() => {
    const catEn = new Map(categories.map((c) => [c.id, c.name_en || ""]));
    return products
      .filter((p) => p.is_available !== false)
      .map((p) => ({
        ...p,
        price: Number(p.price) || 0,
        final_price: p.final_price != null ? Number(p.final_price) : null,
        stock: Number(p.stock) || 0,
        category_name: p.category || "",
        category_name_en: catEn.get(p.category_id) || p.category || "",
      }));
  }, [products, categories]);

  const updateFoodData = useCallback(async (foodId, data) => {
    setProducts((prev) => prev.map((f) => (f.id === foodId ? { ...f, ...data } : f)));
    try {
      await updateProduct(foodId, data);
    } catch (err) {
      console.error("Product update failed:", err);
    }
    await load();
  }, [load]);

  const filteredFoods = useMemo(() => {
    const q = search.trim().toLowerCase();
    return foods.filter((f) => {
      const matchCat = activeCat === "all" || f[catField] === activeCat;
      const matchSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        (f.name_en || "").toLowerCase().includes(q) ||
        (f.barcode || "") === search.trim();
      return matchCat && matchSearch;
    });
  }, [foods, activeCat, search, catField]);

  // Category names in the catalog's order, only those that have sellable products.
  const categoryNames = useMemo(() => {
    const used = new Set(foods.map((f) => f.category_id));
    const names = categories
      .filter((c) => used.has(c.id))
      .map((c) => (isRtl === false ? c.name_en || c.name : c.name))
      .filter(Boolean);
    return ["all", ...Array.from(new Set(names))];
  }, [foods, categories, isRtl]);

  return {
    foods: filteredFoods,
    allFoods: foods,
    categoryNames,
    loading,
    search,
    setSearch,
    activeCat,
    setActiveCat,
    reload: load,
    updateFoodData,
  };
}
