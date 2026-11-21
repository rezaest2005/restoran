import { Box } from "@mui/material";
import useIsMobile from "./useIsMobile";

/**
 * Wraps a <Table> so it never makes the page scroll sideways.
 *
 * Without `cards`: the table keeps its layout and scrolls inside its own box (give `minWidth` so the
 * columns are not squeezed into unreadable slivers on a phone).
 *
 * With `cards`: below `cardsBelow` (default "md") the `cards` node is rendered instead of the table —
 * use it for a list of one card per row.
 *
 *   <ResponsiveTable minWidth={720} sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
 *     <Table size="small">…</Table>
 *   </ResponsiveTable>
 *
 *   <ResponsiveTable cards={<CardList rows={rows} />}><Table>…</Table></ResponsiveTable>
 */
export default function ResponsiveTable({ children, cards, cardsBelow = "md", minWidth = 640, sx, ...rest }) {
  const mobile = useIsMobile(cardsBelow);
  if (cards && mobile) return cards;
  return (
    <Box
      {...rest}
      sx={[
        {
          width: "100%", maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          "& > .MuiTable-root, & > table": { minWidth },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
