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
        <Typography sx={{ flex: 1, minWidth: 140, fontSize: 15, fontWeight: 900, color: C.text }}>
          {next ? t("ui_dh.start.title") : t("ui_dh.start.done_all")}
          <Typography component="span" sx={{ fontSize: 12, color: C.sub, fontWeight: 600, marginInlineStart: 1 }}>{done.length}/{steps.length}</Typography>
        </Typography>
        {next && collapsed && (
          <Button size="small" sx={S.btn} onClick={() => onGo(next)}>{t(`ui_dh.start.steps.${next}`)}</Button>
        )}
        <Button size="small" sx={{ color: C.sub, textTransform: "none" }} onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? t("ui_dh.start.show") : t("ui_dh.start.hide")}
        </Button>
      </Box>
      <LinearProgress variant="determinate" value={pct} aria-label={`${done.length}/${steps.length}`}
        sx={{ mt: 1, height: 4, borderRadius: 2, bgcolor: C.divider, "& .MuiLinearProgress-bar": { bgcolor: C.success } }} />

      {!collapsed && (
        <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
          {steps.map((id, i) => {
            const isDone = counts[id] > 0;
            const isNext = id === next;
            return (
              <Box component="li" key={id}>
                <Button onClick={() => onGo(id)} aria-current={isNext ? "step" : undefined}
                  sx={{
                    textTransform: "none", gap: 1, px: 1.5, py: 0.5, borderRadius: 2, color: C.text, fontWeight: isNext ? 800 : 600,
                    border: `1px solid ${isNext ? C.primary : isDone ? C.success : C.glassBorder}`, bgcolor: isNext ? C.primarySubtle : "transparent",
                  }}>
                  <Box aria-hidden="true" sx={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800,
                    bgcolor: isDone ? C.success : isNext ? C.primary : C.divider, color: isDone || isNext ? C.onPrimary : C.sub,
                  }}>{isDone ? "✓" : i + 1}</Box>
                  {t(`ui_dh.start.steps.${id}`)}
                </Button>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
