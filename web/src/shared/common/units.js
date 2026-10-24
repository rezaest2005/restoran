// ── واحد‌ها — مشترک بین اجناس، فاکتور خرید، فاکتور فروش ──

export const BASE_UNITS = [
  { value: "kg", label: "کیلوگرم" },
  { value: "g", label: "گرم" },
  { value: "l", label: "لیتر" },
  { value: "ml", label: "میلی‌لیتر" },
  { value: "unit", label: "عدد" },
  { value: "bunch", label: "دسته" },
  { value: "pack", label: "بسته" },
];

export const getCustomUnits = () => {
  try {
    return JSON.parse(localStorage.getItem("custom_units") || "[]");
  } catch {
    return [];
  }
};

export const saveCustomUnit = (name) => {
  const unit = { value: "custom_" + Date.now(), label: name.trim() };
  const all = getCustomUnits();
  all.push(unit);
  localStorage.setItem("custom_units", JSON.stringify(all));
  return unit;
};

export const getAllUnits = () => [...BASE_UNITS, ...getCustomUnits()];

export const getUnitLabel = (value) => {
  const all = getAllUnits();
  return all.find((u) => u.value === value)?.label || value;
};