import { readJSON } from "./storage";

// ═══════════ محاسبه موجودی (با material_code) ═══════════
export const calcStock = (warehouseId) => {
  const invoices = readJSON("local_purchase_invoices", []);
  const salesInvoices = readJSON("local_sales_invoices", []);
  const transfers = readJSON("local_transfers", []);
  const stock = {};

  // کلید = material_code (همیشه یکتا)
  const getKey = (it) => it.material_code || it.material_name;

  const addStock = (key, data, qty) => {
    if (!stock[key])
      stock[key] = {
        qty: 0,
        unit: data.unit,
        code: data.code,
        category: data.category,
        price: data.price || 0,
        name: data.name,
      };
    stock[key].qty += qty;
    if (data.price) stock[key].price = data.price;
  };

  for (const inv of invoices) {
    if (String(inv.warehouse_id) !== String(warehouseId)) continue;
    for (const it of inv.items) {
      addStock(getKey(it), {
        unit: it.unit, code: it.material_code,
        category: it.category, price: it.unit_price,
        name: it.material_name,
      }, it.quantity);
    }
  }

  for (const inv of salesInvoices) {
    if (String(inv.warehouse_id) !== String(warehouseId)) continue;
    for (const it of inv.items) {
      addStock(getKey(it), {
        unit: it.unit, code: it.material_code,
        category: it.category, price: it.unit_price,
        name: it.material_name,
      }, -it.quantity);
    }
  }

  for (const tr of transfers) {
    for (const it of tr.items) {
      const base = {
        unit: it.unit, code: it.material_code,
        category: it.category || "", price: it.price,
        name: it.material_name,
      };
      if (String(tr.from_warehouse) === String(warehouseId))
        addStock(getKey(it), base, -it.quantity);
      if (String(tr.to_warehouse) === String(warehouseId))
        addStock(getKey(it), base, it.quantity);
    }
  }

  return Object.values(stock).filter((s) => s.qty !== 0);
};
