import { Chip } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

export default function ChangeChip({ value, suffix = "%", ...props }) {
  const isPositive = value >= 0;

  return (
    <Chip
      icon={
        isPositive ? (
          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
        ) : (
          <ArrowDownwardIcon sx={{ fontSize: 16 }} />
        )
      }
      label={`${isPositive ? "+" : ""}${value}${suffix}`}
      size="small"
      sx={{
        backgroundColor: isPositive
          ? "color-mix(in srgb, var(--success) 15%, transparent)"
          : "color-mix(in srgb, var(--danger) 15%, transparent)",
        color: isPositive ? "var(--success)" : "var(--danger)",
        fontWeight: 600,
        "& .MuiChip-icon": {
          color: isPositive ? "var(--success)" : "var(--danger)",
        },
      }}
      {...props}
    />
  );
}