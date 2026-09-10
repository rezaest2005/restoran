import { Chip } from "@mui/material";

export default function ChangeChip({ value, suffix = "%" }) {
  const pos = value >= 0;
  return (
    <Chip size="small" label={`${pos ? "+" : ""}${value}${suffix}`}
      sx={{
        height: 22, fontSize: 10, fontWeight: 700, borderRadius: "6px",
        bgcolor: pos ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
        color: pos ? "#10b981" : "#ef4444",
        border: `1px solid ${pos ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}
    />
  );
}