/** Shared recharts tooltip + grid styling derived from the palette `C`. */
export default function useChartStyle(C, isDark, isRtl) {
  const tooltipStyle = {
    background: isDark ? "rgba(16,18,16,0.94)" : "rgba(240,244,252,0.96)",
    border: `1px solid ${C.glassBorder}`, borderRadius: "12px",
    fontFamily: "Vazirmatn", fontSize: 14, color: C.text,
    boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.1)",
    padding: "12px 16px",
    direction: isRtl ? "rtl" : "ltr",
  };
  const chartGridStroke = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  return { tooltipStyle, chartGridStroke };
}
