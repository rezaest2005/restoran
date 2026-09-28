import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Chip, CircularProgress,
  Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import {
  fetchWarehouses,
  fetchStock,
  updateMinimumStock,
} from "../api";
import TransferModal from "../components/TransferModal";
import ReceiveModal from "../components/ReceiveModal";
import IssueModal from "../components/IssueModal";
import WasteModal from "../components/WasteModal";

export default function WarehouseTab({ C, isDark, showToast }) {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Modals
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [editStockOpen, setEditStockOpen] = useState(null);

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  // ── لود انبارها ──
  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const data = await fetchWarehouses();
      const list = data.warehouses || [];
      setWarehouses(list);
      // اگر هنوز انتخاب نشده، انبار مرکزی را انتخاب کن
      if (!selectedWarehouse && list.length > 0) {
        const mother = list.find(w => w.is_mother) || list[0];
        setSelectedWarehouse(mother);
      }
    } catch (err) {
      console.error("Fetch warehouses error:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── لود موجودی ──
  const loadStock = async () => {
    if (!selectedWarehouse) return;
    setStockLoading(true);
    try {
      const params = { warehouse_id: selectedWarehouse.id };
      if (search.trim()) params.search = search.trim();
      const data = await fetchStock(params);
      setStockItems(data.items || []);
    } catch (err) {
      console.error("Fetch stock error:", err);
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    loadStock();
  }, [selectedWarehouse?.id, search]);

  // ── فیلتر جستجو ──
  const filteredStock = useMemo(() => {
    return stockItems;
  }, [stockItems]);

  // ── آیا بیشتر از یک انبار داریم؟ ──
  const hasMultipleWarehouses = warehouses.length >= 2;

  // ── بعد از هر عملیات موفق ──
  const handleOperationSuccess = () => {
    loadStock();
    loadWarehouses();
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      fontSize: 13,
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      color: C.text,
      transition: "all 0.25s ease",
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive + "60" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": { boxShadow: `0 0 0 3px ${C.olive}18` },
    },
    "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
    "& .MuiInputBase-input": { color: C.text },
    "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── هدر ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            📦 انبارها
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            انتخاب انبار برای مشاهده موجودی
          </Typography>
        </Box>

        {/* دکمه‌های عملیات */}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            onClick={() => setReceiveOpen(true)}
            disabled={!selectedWarehouse}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: "#fff", background: C.btnGrad,
              "&:hover": { transform: "translateY(-1px)" },
            }}
          >
            ➕ ورود کالا
          </Button>
          <Button
            onClick={() => setIssueOpen(true)}
            disabled={!selectedWarehouse}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: C.warning, bgcolor: C.warningBg,
              border: `1px solid ${C.warning}30`,
              "&:hover": { bgcolor: C.warningBg, transform: "translateY(-1px)" },
            }}
          >
            ➖ خروج کالا
          </Button>
          <Button
            onClick={() => setWasteOpen(true)}
            disabled={!selectedWarehouse}
            sx={{
              borderRadius: "10px", fontSize: 11, fontWeight: 700,
              textTransform: "none", px: 2, py: 0.8,
              color: C.danger, bgcolor: C.dangerBg,
              border: `1px solid ${C.danger}30`,
              "&:hover": { bgcolor: C.dangerBg, transform: "translateY(-1px)" },
            }}
          >
            🗑 ضایعات
          </Button>
          {/* دکمه انتقال فقط وقتی ۲+ انبار وجود دارد */}
          {hasMultipleWarehouses && (
            <Button
              onClick={() => setTransferOpen(true)}
              sx={{
                borderRadius: "10px", fontSize: 11, fontWeight: 700,
                textTransform: "none", px: 2, py: 0.8,
                color: C.info, bgcolor: C.infoBg,
                border: `1px solid ${C.info}30`,
                "&:hover": { bgcolor: C.infoBg, transform: "translateY(-1px)" },
              }}
            >
              🔄 انتقال کالا
            </Button>
          )}
        </Box>
      </Box>

      {/* ── کارت‌های انبار ── */}
      <Box sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr 1fr",
          sm: "1fr 1fr 1fr",
          md: "1fr 1fr 1fr 1fr",
        },
        gap: 1.5,
        mb: 3,
      }}>
        {warehouses.map((w, i) => {
          const isSelected = selectedWarehouse?.id === w.id;
          return (
            <Box
              key={w.id}
              onClick={() => setSelectedWarehouse(w)}
              sx={{
                p: 2,
                borderRadius: "14px",
                cursor: "pointer",
                transition: "all 0.25s ease",
                bgcolor: isSelected ? C.oliveSubtle : C.glass,
                backdropFilter: "blur(12px)",
                border: `2px solid ${isSelected ? C.olive : w.is_mother ? C.olive + "40" : C.glassBorder}`,
                boxShadow: isSelected ? `0 4px 20px ${C.olive}20` : "none",
                opacity: 0,
                animation: `fadeUp 0.35s ease-out ${i * 0.05}s forwards`,
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: `0 4px 20px ${C.olive}15`,
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 20 }}>
                  {w.warehouse_type === "mother" ? "🏭" :
                   w.warehouse_type === "kitchen" ? "🍳" :
                   w.warehouse_type === "cold_storage" ? "❄️" :
                   w.warehouse_type === "freezer" ? "🧊" :
                   w.warehouse_type === "vegetables" ? "🥬" :
                   w.warehouse_type === "branch" ? "🏪" : "📦"}
                </Typography>
                <Typography sx={{
                  fontSize: 13, fontWeight: 800,
                  color: isSelected ? C.olive : C.text,
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {w.name}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                {w.is_mother && (
                  <Chip size="small" label="مرکزی" sx={{
                    height: 18, fontSize: 8, fontWeight: 700,
                    borderRadius: "5px", bgcolor: C.olive, color: "#fff",
                  }} />
                )}
                <Chip size="small" label={`${w.stock_count || 0} قلم`} sx={{
                  height: 18, fontSize: 8, fontWeight: 600,
                  borderRadius: "5px",
                  bgcolor: isSelected ? C.olive + "20" : C.oliveSubtle,
                  color: C.olive,
                }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* ── پیام راهنما: انتقال ── */}
      {!hasMultipleWarehouses && (
        <Box sx={{
          mb: 2, p: 1.5, borderRadius: "12px",
          bgcolor: C.infoBg, border: `1px solid ${C.info}30`,
          display: "flex", alignItems: "center", gap: 1,
        }}>
          <Typography sx={{ fontSize: 16 }}>💡</Typography>
          <Typography sx={{ fontSize: 11, color: C.sub }}>
            برای انتقال کالا، ابتدا یک انبار دیگر ایجاد کنید. (📚 دیکشنری → 📦 انبارها)
          </Typography>
        </Box>
      )}

      {/* ── هدر موجودی ── */}
      {selectedWarehouse && (
        <>
          <Box sx={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1,
          }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              موجودی — {selectedWarehouse.name}
            </Typography>
            <TextField
              size="small"
              placeholder="جستجو کالا..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ ...inputSx, width: "100%", maxWidth: 250 }}
            />
          </Box>

          {/* ── لیست موجودی ── */}
          {stockLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress sx={{ color: C.olive }} size={28} />
            </Box>
          ) : filteredStock.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Typography sx={{ fontSize: 40, mb: 1 }}>📦</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                هنوز کالایی در این انبار وجود ندارد
              </Typography>
              <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5, mb: 2 }}>
                برای شروع، کالا را وارد انبار کنید
              </Typography>
              <Button
                onClick={() => setReceiveOpen(true)}
                sx={{
                  borderRadius: "10px", fontSize: 12, fontWeight: 700,
                  textTransform: "none", px: 3, py: 1,
                  color: "#fff", background: C.btnGrad,
                }}
              >
                ➕ ورود کالا
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
              {/* هدر جدول */}
              <Box sx={{
                display: "flex", px: 2, py: 1,
                borderRadius: "8px", bgcolor: C.oliveSubtle,
                fontSize: 10, fontWeight: 700, color: C.sub,
              }}>
                <Box sx={{ flex: 2 }}>کالا</Box>
                <Box sx={{ flex: 1, textAlign: "center" }}>موجودی</Box>
                <Box sx={{ flex: 1, textAlign: "center" }}>واحد</Box>
                <Box sx={{ flex: 1, textAlign: "center" }}>ارزش</Box>
                <Box sx={{ flex: 1, textAlign: "center" }}>وضعیت</Box>
              </Box>

              {filteredStock.map((item, i) => (
                <Box
                  key={item.id}
                  sx={{
                    display: "flex", alignItems: "center",
                    px: 2, py: 1.2, borderRadius: "10px",
                    bgcolor: C.glass, backdropFilter: "blur(12px)",
                    border: `1px solid ${C.glassBorder}`,
                    transition: "all 0.2s ease",
                    opacity: 0,
                    animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
                    "&:hover": {
                      bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                    },
                  }}
                >
                  <Box sx={{ flex: 2, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: 12, fontWeight: 700, color: C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.material_name}
                    </Typography>
                    <Typography sx={{ fontSize: 9, color: C.muted }}>
                      {int(item.material_price).toLocaleString("fa-IR")} تومان / {item.material_unit_display}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, textAlign: "center" }}>
                    <Typography sx={{
                      fontSize: 13, fontWeight: 800,
                      color: item.quantity <= 0 ? C.danger : C.text,
                    }}>
                      {Number(item.quantity).toLocaleString("fa-IR")}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: C.sub }}>
                      {item.material_unit_display}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, textAlign: "center" }}>
                    <Typography sx={{ fontSize: 11, color: C.text, fontWeight: 600 }}>
                      {Number(item.total_value).toLocaleString("fa-IR")}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, textAlign: "center" }}>
                    {item.quantity <= 0 ? (
                      <Chip size="small" label="ناموجود" sx={{
                        height: 18, fontSize: 8, fontWeight: 700,
                        borderRadius: "5px", bgcolor: C.dangerBg, color: C.danger,
                      }} />
                    ) : item.minimum_stock > 0 && item.quantity <= item.minimum_stock ? (
                      <Chip size="small" label="کمبود" sx={{
                        height: 18, fontSize: 8, fontWeight: 700,
                        borderRadius: "5px", bgcolor: C.warningBg, color: C.warning,
                      }} />
                    ) : (
                      <Chip size="small" label="موجود" sx={{
                        height: 18, fontSize: 8, fontWeight: 700,
                        borderRadius: "5px", bgcolor: C.oliveSubtle, color: C.olive,
                      }} />
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {/* ═══════════════════════════════
           MODALS
      ════════════════════════════════ */}

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        warehouses={warehouses}
        C={C} isDark={isDark}
        onSuccess={handleOperationSuccess}
        showToast={showToast}
      />

      <ReceiveModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        warehouse={selectedWarehouse}
        C={C} isDark={isDark}
        onSuccess={handleOperationSuccess}
        showToast={showToast}
      />

      <IssueModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        warehouse={selectedWarehouse}
        C={C} isDark={isDark}
        onSuccess={handleOperationSuccess}
        showToast={showToast}
      />

      <WasteModal
        open={wasteOpen}
        onClose={() => setWasteOpen(false)}
        warehouse={selectedWarehouse}
        C={C} isDark={isDark}
        onSuccess={handleOperationSuccess}
        showToast={showToast}
      />
    </Box>
  );
}