import { useMediaQuery, useTheme } from "@mui/material";

/**
 * true when the viewport is narrower than the given MUI breakpoint.
 *   useIsMobile()      → below md (900px): phones + portrait tablets (sidebars become drawers, tables become cards)
 *   useIsMobile("sm")  → below sm (600px): phones only (dialogs go full screen)
 */
export default function useIsMobile(breakpoint = "md") {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down(breakpoint), { noSsr: true });
}
