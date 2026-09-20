import { useState, useCallback } from "react";
import { Box, Grid, Typography, CircularProgress } from "@mui/material";
import FoodCard from "./FoodCard";

export default function FoodGrid({
  foods = [], loading, onAdd, onRemove, C, showStock, isRtl, editMode, onSave,
}) {
  const [pinned, setPinned] = useState(new Set());
  const [order, setOrder] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const togglePin = useCallback((id) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback((e, dropIdx) => {
    e.preventDefault();
    setOverIdx(null);
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return; }
    setOrder(prev => {
      const list = prev ? [...prev] : foods.map(f => f.id);
      const [moved] = list.splice(dragIdx, 1);
      list.splice(dropIdx, 0, moved);
      return list;
    });
    setDragIdx(null);
  }, [dragIdx, foods]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} />
      </Box>
    );
  }

  if (!foods || foods.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography sx={{ color: C.muted, fontSize: 14, fontFamily: "'Vazirmatn', sans-serif" }}>
          {isRtl ? "غذایی یافت نشد" : "No food found"}
        </Typography>
      </Box>
    );
  }

  let sorted = [...foods];
  if (order) {
    const map = new Map(foods.map(f => [f.id, f]));
    sorted = order.map(id => map.get(id)).filter(Boolean);
    foods.forEach(f => { if (!order.includes(f.id)) sorted.push(f); });
  }

  sorted.sort((a, b) => {
    const aP = pinned.has(a.id) ? 1 : 0;
    const bP = pinned.has(b.id) ? 1 : 0;
    return bP - aP;
  });

  return (
    <Grid container spacing={1.5}>
      {sorted.map((food, i) => (
        <Grid
          size={{ xs: 12, sm: 6 }}
          key={food.id}
          draggable
          onDragStart={(e) => handleDragStart(e, i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          sx={{
            transition: "all 0.2s ease",
            transform: overIdx === i && dragIdx !== i ? "scale(1.02)" : "none",
            opacity: dragIdx === i ? 0.35 : 1,
            borderRadius: "14px",
            outline: overIdx === i && dragIdx !== i ? `2px dashed ${C.olive}55` : "none",
            outlineOffset: 2,
          }}
        >
          <FoodCard
            food={food}
            onAdd={onAdd}
            onRemove={onRemove}
            C={C}
            showStock={showStock}
            index={i}
            isRtl={isRtl}
            editMode={editMode}
            isPinned={pinned.has(food.id)}
            onPin={togglePin}
            onSave={onSave}
          />
        </Grid>
      ))}
    </Grid>
  );
}