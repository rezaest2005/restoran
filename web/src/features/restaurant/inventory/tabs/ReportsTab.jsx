import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  CircularProgress, Chip,
} from "@mui/material";
import {
  fetchStockValueReport,
  fetchItemMovement,
  fetchWarehouseMovements,
  fetchWarehouses,
} from "../api";

const REPORT_TABS = [
  { id: "stock_value", icon: "💰", label: "ارزش موجودی" },
  { id: "movements", icon: "📋", label: "حرکات کالا" },
  { id: "low_stock", icon: "⚠️", label: "کمبود موجودی" },
];

const MOVEMENT_TYPE_LABELS = {
  receive: { label: "ورود", icon: "📥", color: "olive", bg: "oliveSubtle" },
  issue: { label: "خروج", icon: "📤", color: "warning", bg: "warningBg" },
  waste: { label: "ضایعات", icon: "🗑", color: "danger", bg: "dangerBg" },
  transfer: { label: "انتقال", icon: "🔄", color: "info", bg: "infoBg" },
  adjustment: { label: "اصلاح", icon: "✏️", color: "olive", bg: "oliveSubtle" },
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

export default function ReportsTab({ C, isDark, showToast }) {
  const [activeReport, setActiveReport] = useState("stock_value");
  const [loading, setLoading] = useState(false);

  // داده‌ها
  const [stockValue, setStockValue] = useState(null);
  const [movements, setMovements] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // فیلترها
  const [warehouseFilter, setWarehouseFilter] = useState("");

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── لود داده بر اساس تب فعال ──
  const loadReport = async () => {
    setLoading(true);
    try {
      const whData = await fetchWarehouses().catch(() => ({ warehouses: [] }));
      setWarehouses(whData.warehouses || []);

      const params = {};
      if (warehouseFilter) params.warehouse_id = warehouseFilter;

      if (activeReport === "stock_value") {
        const data = await fetchStockValueReport(params);
        setStockValue(data);
        setLowStock(data.low_stock_items || []);
      } else if (activeReport === "movements") {
        const data = await fetchWarehouseMovements(params);
        setMovements(data.movements || []);
      } else if (activeReport === "low_stock") {
        const data = await fetchStockValueReport(params);
        setLowStock(data.low_stock_items || []);
      }
    } catch (err) {
      console.error("Load report error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, [activeReport, warehouseFilter]);

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", bgcolor: C.inputBg, backdropFilter: "blur(8px)",
      fontSize: 13, fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", color: C.text,
      transition: "all 0.25s ease",
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 3px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
    "& .MuiInputBase-input": { color: C.text },
  };

  return (
    <Box>
      {/* ── هدر ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            📊 گزارشات انبار
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            آنالیز موجودی، حرکات و گزارشات
          </Typography>
        </Box>

        {/* فیلتر انبار */}
        <Select
          size="small"
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          displayEmpty
          sx={{ ...inputSx, fontSize: 12, minWidth: 160 }}
        >
          <MenuItem value="">همه انبارها</MenuItem>
          {warehouses.map(w => (
            <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
          ))}
        </Select>
      </Box>

      {/* ── تب‌های گزارش ── */}
      <Box sx={{ display: "flex", gap: 0.5, mb: 2.5, flexWrap: "wrap" }}>
        {REPORT_TABS.map(tab => (
          <Button
            key={tab.id}
            onClick={() => setActiveReport(tab.id)}
            sx={{
              borderRadius: "10px", px: 2, py: 0.8,
              fontSize: 11, fontWeight: activeReport === tab.id ? 700 : 500,
              textTransform: "none", transition: "all 0.2s ease",
              color: activeReport === tab.id ? C.olive : C.sub,
              bgcolor: activeReport === tab.id ? C.oliveSubtle : C.glass,
              border: `1px solid ${activeReport === tab.id ? C.olive + "30" : C.glassBorder}`,
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          >
            {tab.icon} {tab.label}
          </Button>
        ))}
      </Box>

      {/* ── محتوا ── */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: C.olive }} size={36} />
        </Box>
      ) : (
        <>
          {/* ══ ۱. ارزش موجودی ══ */}
          {activeReport === "stock_value" && (
            <Box>
              {/* کارت‌های خلاصه */}
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr 1fr" },
                gap: 1.5,
                mb: 3,
              }}>
                {[
                  { label: "ارزش کل", value: stockValue?.total_value || 0, icon: "💰", color: C.olive },
                  { label: "تعداد قلم", value: stockValue?.total_items || 0, icon: "📦", color: C.info },
                  { label: "کمبود", value: lowStock.length, icon: "⚠️", color: C.warning },
                  { label: "ناموجود", value: stockValue?.out_of_stock || 0, icon: "🚫", color: C.danger },
                ].map((card, i) => (
                  <Box key={i} sx={{
                    p: 2, borderRadius: "14px",
                    bgcolor: C.glass, backdropFilter: "blur(12px)",
                    border: `1px solid ${C.glassBorder}`,
                    opacity: 0,
                    animation: `fadeUp 0.3s ease-out ${i * 0.08}s forwards`,
                  }}>
                    <Typography sx={{ fontSize: 10, color: C.sub, mb: 0.5 }}>
                      {card.icon} {card.label}
                    </Typography>
                    <Typography sx={{ fontSize: 20, fontWeight: 900, color: card.color }}>
                      {typeof card.value === "number" && card.label === "ارزش کل"
                        ? card.value.toLocaleString("fa-IR")
                        : card.value.toLocaleString("fa-IR")}
                    </Typography>
                    {card.label === "ارزش کل" && (
                      <Typography sx={{ fontSize: 9, color: C.muted }}>تومان</Typography>
                    )}
                  </Box>
                ))}
              </Box>

              {/* لیست کمبود */}
              {lowStock.length > 0 && (
                <Box sx={{
                  mb: 3, p: 2, borderRadius: "14px",
                  bgcolor: C.warningBg, border: `1px solid ${C.warning}30`,
                }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.warning, mb: 1 }}>
                    ⚠️ کالاهای دارای کمبود
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {lowStock.map((item, i) => (
                      <Chip key={i} size="small"
                        label={`${item.material_name}: ${item.quantity}/${item.minimum_stock}`}
                        sx={{
                          height: 22, fontSize: 9, fontWeight: 600, borderRadius: "6px",
                          bgcolor: C.warningBg, color: C.warning,
                          border: `1px solid ${C.warning}40`,
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* جدول کالاها */}
              {stockValue?.items?.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
                  <Box sx={{
                    display: "flex", px: 2, py: 1,
                    borderRadius: "8px", bgcolor: C.oliveSubtle,
                    fontSize: 10, fontWeight: 700, color: C.sub,
                  }}>
                    <Box sx={{ flex: 2 }}>کالا</Box>
                    <Box sx={{ flex: 1, textAlign: "center" }}>موجودی</Box>
                    <Box sx={{ flex: 1, textAlign: "center" }}>قیمت واحد</Box>
                    <Box sx={{ flex: 1, textAlign: "center" }}>ارزش</Box>
                  </Box>
                  {stockValue.items.map((item, i) => (
                    <Box key={i} sx={{
                      display: "flex", alignItems: "center",
                      px: 2, py: 1, borderRadius: "10px",
                      bgcolor: C.glass, backdropFilter: "blur(12px)",
                      border: `1px solid ${C.glassBorder}`,
                      opacity: 0,
                      animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
                    }}>
                      <Box sx={{ flex: 2 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                          {item.material_name}
                        </Typography>
                        <Typography sx={{ fontSize: 9, color: C.muted }}>
                          {item.warehouse_name}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                          {Number(item.quantity).toLocaleString("fa-IR")}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 11, color: C.sub }}>
                          {Number(item.unit_price || 0).toLocaleString("fa-IR")}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.olive }}>
                          {Number(item.total_value || 0).toLocaleString("fa-IR")}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: "center", py: 6 }}>
                  <Typography sx={{ fontSize: 36, mb: 1 }}>💰</Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    داده‌ای موجود نیست
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* ══ ۲. حرکات کالا ══ */}
          {activeReport === "movements" && (
            <Box>
              {movements.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography sx={{ fontSize: 40, mb: 1 }}>📋</Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    حرکتی ثبت نشده
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
                  <Box sx={{
                    display: "flex", px: 2, py: 1,
                    borderRadius: "8px", bgcolor: C.oliveSubtle,
                    fontSize: 10, fontWeight: 700, color: C.sub,
                  }}>
                    <Box sx={{ width: 50 }}>نوع</Box>
                    <Box sx={{ flex: 1.5 }}>تاریخ</Box>
                    <Box sx={{ flex: 1.5 }}>کالا</Box>
                    <Box sx={{ flex: 1, textAlign: "center" }}>مقدار</Box>
                    <Box sx={{ flex: 1, textAlign: "center" }}>ارزش</Box>
                    <Box sx={{ flex: 1 }}>انبار</Box>
                  </Box>

                  {movements.map((m, i) => {
                    const mt = MOVEMENT_TYPE_LABELS[m.movement_type] || MOVEMENT_TYPE_LABELS.adjustment;
                    return (
                      <Box key={m.id || i} sx={{
                        display: "flex", alignItems: "center",
                        px: 2, py: 1, borderRadius: "10px",
                        bgcolor: C.glass, backdropFilter: "blur(12px)",
                        border: `1px solid ${C.glassBorder}`,
                        opacity: 0,
                        animation: `fadeUp 0.3s ease-out ${i * 0.02}s forwards`,
                      }}>
                        <Box sx={{ width: 50 }}>
                          <Chip size="small" label={`${mt.icon} ${mt.label}`} sx={{
                            height: 18, fontSize: 8, fontWeight: 700,
                            borderRadius: "5px", bgcolor: C[mt.bg], color: C[mt.color],
                          }} />
                        </Box>
                        <Box sx={{ flex: 1.5 }}>
                          <Typography sx={{ fontSize: 11, color: C.sub }}>
                            {formatDate(m.created_at)}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1.5, minWidth: 0 }}>
                          <Typography sx={{
                            fontSize: 12, fontWeight: 700, color: C.text,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {m.material_name}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1, textAlign: "center" }}>
                          <Typography sx={{
                            fontSize: 12, fontWeight: 700,
                            color: m.movement_type === "receive" ? C.olive :
                                   m.movement_type === "waste" ? C.danger :
                                   m.movement_type === "issue" ? C.warning : C.text,
                          }}>
                            {m.movement_type === "receive" ? "+" : "-"}
                            {Math.abs(Number(m.quantity)).toLocaleString("fa-IR")}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1, textAlign: "center" }}>
                          <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>
                            {Number(m.total_value || 0).toLocaleString("fa-IR")}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{
                            fontSize: 11, color: C.muted,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {m.warehouse_name}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          )}

          {/* ══ ۳. کمبود موجودی ══ */}
          {activeReport === "low_stock" && (
            <Box>
              {lowStock.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography sx={{ fontSize: 40, mb: 1 }}>✅</Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.olive }}>
                    همه کالاها موجودی کافی دارند
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                  {lowStock.map((item, i) => (
                    <Box key={i} sx={{
                      display: "flex", alignItems: "center",
                      px: 2, py: 1.5, borderRadius: "12px",
                      bgcolor: C.warningBg,
                      border: `1px solid ${C.warning}30`,
                      opacity: 0,
                      animation: `fadeUp 0.3s ease-out ${i * 0.05}s forwards`,
                    }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {item.material_name}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: C.sub }}>
                          {item.warehouse_name}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "center", mx: 2 }}>
                        <Typography sx={{ fontSize: 11, color: C.sub }}>موجودی فعلی</Typography>
                        <Typography sx={{ fontSize: 18, fontWeight: 900, color: C.danger }}>
                          {Number(item.quantity).toLocaleString("fa-IR")}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "center" }}>
                        <Typography sx={{ fontSize: 11, color: C.sub }}>حداقل</Typography>
                        <Typography sx={{ fontSize: 18, fontWeight: 900, color: C.warning }}>
                          {Number(item.minimum_stock).toLocaleString("fa-IR")}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}