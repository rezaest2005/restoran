// Category-discount helpers shared by the cart, the food grid and the category bar.

/** True when the discount has a positive amount and has not expired. */
export const isDiscountActive = (d) => {
  if (!d || !d.amount || d.amount <= 0) return false;
  if (!d.expiresAt) return true;
  return Date.now() < d.expiresAt;
};

/** Discount value for a base price (fixed amount or percent). */
export const computeDiscountAmount = (basePrice, discount) => {
  if (!isDiscountActive(discount)) return 0;
  if (discount.type === "percent") return (basePrice * discount.amount) / 100;
  return discount.amount;
};

/** Keys under which an item's category discount may be stored. */
export const getItemCategoryKeys = (item) =>
  [item.category, item.category_name, item.category_name_en].filter(Boolean);

export const formatDiscountLabel = (d) => {
  if (!isDiscountActive(d)) return "";
  return d.type === "percent" ? `%${d.amount}` : d.amount.toLocaleString();
};
