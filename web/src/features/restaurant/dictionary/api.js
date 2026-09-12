import client from "../api/client";

/* ── Food CRUD ─────────────────────────────── */

export const fetchFoods = () =>
  client.get("/api/dictionary/food-menu/").then(r => r.data.items || []);

export const createFood = (data) =>
  client.post("/api/dictionary/food/create/", data).then(r => r.data);

export const updateFood = (id, data) =>
  client.post(`/api/dictionary/food/${id}/update/`, data).then(r => r.data);

export const deleteFood = (id) =>
  client.post(`/api/dictionary/food/${id}/delete/`).then(r => r.data);

/* ── Auto Translate (MyMemory) ─────────────── */

export const autoTranslate = async (text, from = "fa", to = "en") => {
  if (!text || !text.trim()) return "";
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText;
      if (translated.toLowerCase() === text.toLowerCase()) return "";
      return translated;
    }
    return "";
  } catch {
    return "";
  }
};