import { useState } from "react";
import { Box, Typography, Button, LinearProgress } from "@mui/material";
import { useLoader } from "./common";
import { fetchWarehouses, fetchItems, fetchFormulas, fetchUsers } from "./api";

const COLLAPSE_KEY = "defs_start_collapsed";

/** step id → { tab it opens, how to count what is already defined } */
const STEP_COUNTERS = {
  warehouses: () => fetchWarehouses().then((l) => (Array.isArray(l) ? l.length : 0)),
  items: () => fetchItems({ page_size: 1 }).then((r) => r.total || 0),
  formulas: () => fetchFormulas().then((l) => (Array.isArray(l) ? l.length : (l?.results || []).length)),
  products: () => fetchItems({ page_size: 1, material_type: "finished" }).then((r) => r.total || 0),
  // the owner is always there; "done" once somebody else has a sign-in
  users: () => fetchUsers().then((l) => Math.max((Array.isArray(l) ? l.length : 0) - 1, 0)),
};


const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
};
const writeCollapsed = (v) => {
  try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* storage blocked: keep it in memory only */ }
};

/**
 * "Start here": the order a new business defines things in
 * (warehouses → items → formulas → products → people), what is done and what comes next.
 * `steps` = ids of steps the user can reach (tabs they may open); `refreshKey` re-counts.
 */
export default function StartChecklist({ ctx, steps, refreshKey, onGo }) {
  const { t, C, S } = ctx;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { data } = useLoader(
    () => Promise.all(steps.map((id) => STEP_COUNTERS[id]().catch(() => null))).then((n) => Object.fromEntries(steps.map((id, i) => [id, n[i]]))),
    `${steps.join(",")}|${refreshKey}`,
  );
  if (!steps.length) return null;
  const counts = data || {};
  const done = steps.filter((id) => counts[id] > 0);
  const next = steps.find((id) => !(counts[id] > 0));
  const pct = Math.round((done.length / steps.length) * 100);
  const toggle = () => { writeCollapsed(!collapsed); setCollapsed(!collapsed); };

  return (
    <Box component="section" aria-label={t("ui_dh.start.title")} sx={{ ...S.card, mb: 2, p: { xs: 1.5, md: 2 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 900, color: C.text }}>
            <span aria-hidden="true">🧭 </span>{next ? t("ui_dh.start.title") : t("ui_dh.start.done_all")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub }}>
            {t("ui_dh.start.progress", { done: done.length, total: steps.length })}
            {next && collapsed ? ` · ${t("ui_dh.start.next")}: ${t(`ui_dh.start.steps.${next}.title`)}` : ""}
          </Typography>
        </Box>
        {next && collapsed && (
          <Button size="small" sx={S.btn} onClick={() => onGo(next)}>{t("ui_dh.start.go")}</Button>
        )}
        <Button size="small" sx={{ color: C.sub, textTransform: "none" }} onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? t("ui_dh.start.show") : t("ui_dh.start.hide")}
        </Button>
      </Box>
      <LinearProgress variant="determinate" value={pct} aria-label={t("ui_dh.start.progress", { done: done.length, total: steps.length })}
        sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: C.divider, "& .MuiLinearProgress-bar": { bgcolor: C.success } }} />

      {!collapsed && (
        <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 1.5, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: `repeat(${steps.length}, 1fr)` } }}>
          {steps.map((id, i) => {
            const isDone = counts[id] > 0;
            const isNext = id === next;
            return (
              <Box component="li" key={id} sx={{
                p: 1.25, borderRadius: 2, display: "flex", flexDirection: "column", gap: 0.5,
                border: `1px solid ${isNext ? C.primary : isDone ? C.success : C.glassBorder}`,
                bgcolor: isNext ? C.primarySubtle : "transparent",
              }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box aria-hidden="true" sx={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800,
                    bgcolor: isDone ? C.success : isNext ? C.primary : C.divider, color: isDone || isNext ? C.onPrimary : C.sub,
                  }}>{isDone ? "✓" : i + 1}</Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.text }}>{t(`ui_dh.start.steps.${id}.title`)}</Typography>
                </Box>
                <Typography sx={{ fontSize: 11.5, color: C.sub, flex: 1 }}>{t(`ui_dh.start.steps.${id}.hint`)}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography sx={{ fontSize: 11, color: isDone ? C.success : C.muted, fontWeight: 700 }}>
                    {counts[id] == null ? "…" : isDone ? t("ui_dh.start.count", { n: counts[id] }) : t("ui_dh.start.todo")}
                  </Typography>
                  <Button size="small" onClick={() => onGo(id)}
                    sx={isNext ? { ...S.btn, py: 0.25, px: 1.5, fontSize: 12 } : { color: C.primary, textTransform: "none", fontSize: 12 }}>
                    {isDone ? t("ui_dh.start.open") : t("ui_dh.start.go")}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
