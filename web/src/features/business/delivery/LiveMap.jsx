import { Box, Typography } from "@mui/material";

const W = 320;
const H = 240;
const PAD = 24;

/**
 * Plain SVG position view — no external map provider or API key.
 * points: [{ id, type: "driver"|"vehicle", name, lat, lng }]; stops: [{ id, lat, lng, status }]
 */
export default function LiveMap({ ctx, points = [], stops = [] }) {
  const { t, C } = ctx;
  const all = [...points, ...stops].filter((p) => p.lat != null && p.lng != null);

  const project = (() => {
    if (!all.length) return () => [W / 2, H / 2];
    const lats = all.map((p) => p.lat);
    const lngs = all.map((p) => p.lng);
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
    const spanLat = Math.max(maxLat - minLat, 0.005);
    const spanLng = Math.max(maxLng - minLng, 0.005);
    const sx = (W - 2 * PAD) / spanLng;
    const sy = (H - 2 * PAD) / spanLat;
    const s = Math.min(sx, sy);
    const cx = (minLng + maxLng) / 2;
    const cy = (minLat + maxLat) / 2;
    return (lat, lng) => [W / 2 + (lng - cx) * s, H / 2 - (lat - cy) * s];
  })();

  const grid = [0.25, 0.5, 0.75];
  return (
    <Box>
      <Box sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, bgcolor: C.inputBg, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("ui_del.map.title")} style={{ display: "block" }}>
          {grid.map((g) => (
            <g key={g} stroke={C.bgGrid} strokeWidth="1">
              <line x1={W * g} y1="0" x2={W * g} y2={H} stroke={C.divider} />
              <line x1="0" y1={H * g} x2={W} y2={H * g} stroke={C.divider} />
            </g>
          ))}
          {stops.filter((s) => s.lat != null && s.lng != null).map((s) => {
            const [x, y] = project(s.lat, s.lng);
            const done = s.status === "delivered";
            return (
              <g key={`s${s.id}`}>
                <rect x={x - 5} y={y - 5} width="10" height="10" rx="2"
                  fill={done ? C.success : s.status === "failed" ? C.danger : "none"}
                  stroke={done ? C.success : s.status === "failed" ? C.danger : C.sub} strokeWidth="2" />
              </g>
            );
          })}
          {points.filter((p) => p.lat != null && p.lng != null).map((p) => {
            const [x, y] = project(p.lat, p.lng);
            const col = p.type === "vehicle" ? C.accent : C.primary;
            return (
              <g key={`${p.type}${p.id}`}>
                <circle cx={x} cy={y} r="14" fill={col} opacity="0.18" />
                <circle cx={x} cy={y} r="7" fill={col} stroke={C.surface} strokeWidth="2" />
                <text x={x} y={y - 12} textAnchor="middle" fontSize="10" fill={C.text}>{p.name}</text>
              </g>
            );
          })}
          {!all.length && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill={C.muted}>{t("ui_del.map.empty")}</text>
          )}
        </svg>
      </Box>
      <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.75 }}>{t("ui_del.map.note")}</Typography>
    </Box>
  );
}
