import { Box, Button } from "@mui/material";

/**
 * Glass pill tab bar used by the inventory page and the dictionary page.
 * tabs: [{ id, icon, label }] — `getButtonProps(tab, idx)` lets the caller add drag handlers etc.
 */
export default function TabBar({ tabs, active, onSelect, C, getButtonProps, showHints = true }) {
  return (
    <Box
      sx={{
        display: "flex", gap: 0.5, mb: 3,
        bgcolor: C.glass,        border: `1px solid ${C.glassBorder}`,
        borderRadius: "14px", p: 0.5,
        width: "fit-content", flexWrap: "wrap",
      }}
    >
      {tabs.map((tab, idx) => {
        const extra = getButtonProps ? getButtonProps(tab, idx) : {};
        const { sx: extraSx, ...rest } = extra;
        return (
          <Button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            {...rest}
            sx={{
              borderRadius: "10px", px: { xs: 1.5, md: 2.5 }, py: 1,
              fontSize: 12, fontWeight: active === tab.id ? 700 : 500,
              textTransform: "none", transition: "all 0.2s ease",
              color: active === tab.id ? C.olive : C.sub,
              bgcolor: active === tab.id ? C.oliveSubtle : "transparent",
              border: active === tab.id ? `1px solid ${C.olive}30` : "1px solid transparent",
              "&:hover": { bgcolor: C.oliveSubtle },
              ...extraSx,
            }}
          >
            {tab.icon} {tab.label}
            {showHints && idx < 9 && (
              <Box
                component="kbd"
                sx={{
                  display: { xs: "none", lg: "inline-block" }, marginInlineStart: 0.8,
                  px: 0.5, fontSize: 9, fontFamily: "inherit", opacity: 0.55,
                  border: "1px solid currentColor", borderRadius: "5px", direction: "ltr",
                }}
              >
                Alt+{idx + 1}
              </Box>
            )}
          </Button>
        );
      })}
    </Box>
  );
}
