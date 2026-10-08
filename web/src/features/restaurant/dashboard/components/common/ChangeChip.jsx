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
          ? "rgba(76, 175, 80, 0.15)"
          : "rgba(244, 67, 54, 0.15)",
        color: isPositive ? "#4caf50" : "#f44336",
        fontWeight: 600,
        "& .MuiChip-icon": {
          color: isPositive ? "#4caf50" : "#f44336",
        },
      }}
      {...props}
    />
  );
}