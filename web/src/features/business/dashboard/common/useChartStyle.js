/** Shared recharts tooltip + grid styling derived from the palette `C`. */
export default function useChartStyle(C, isDark, isRtl) {
  const tooltipStyle = {
    background: isDark ? "color-mix(in srgb, var(--ink) 94%, transparent)" : "var(--surface)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "12px",
    fontFamily: "Vazirmatn", fontSize: 14, color: C.text,
    boxShadow: isDark ? "0 8px 32px color-mix(in srgb, var(--ink) 50%, transparent)" : "0 8px 32px color-mix(in srgb, var(--ink) 10%, transparent)",
    padding: "12px 16px",
    direction: isRtl ? "rtl" : "ltr",
  };
  const chartGridStroke = isDark ? "var(--line)" : "color-mix(in srgb, var(--ink) 5%, transparent)";
  return { tooltipStyle, chartGridStroke };
}
