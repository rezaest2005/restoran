import { Dialog } from "@mui/material";
import useIsMobile from "./useIsMobile";

const FULL_SCREEN_PAPER = {
  borderRadius: 0, border: "none", m: 0,
  // keep content clear of the phone's notch / home bar
  paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
};

/**
 * Drop-in replacement for MUI <Dialog>: same props, but it becomes full screen below `fullScreenBelow`
 * (default "sm" = phones). Any rounded corners / border passed in slotProps.paper.sx are removed while
 * full screen, so a "glass" dialog does not look clipped on a phone.
 *
 *   <ResponsiveDialog open={open} onClose={close} maxWidth="md" fullWidth>…</ResponsiveDialog>
 *   <ResponsiveDialog fullScreenBelow={false} …>  → never full screen (small confirmations)
 */
export default function ResponsiveDialog({ fullScreenBelow = "sm", fullScreen, slotProps, PaperProps, children, ...rest }) {
  const below = useIsMobile(fullScreenBelow || "xs");
  const isFull = fullScreen ?? (fullScreenBelow ? below : false);
  const paper = slotProps?.paper || PaperProps || {};
  const paperSx = isFull ? [...(Array.isArray(paper.sx) ? paper.sx : [paper.sx]), FULL_SCREEN_PAPER] : paper.sx;
  return (
    <Dialog
      {...rest}
      fullScreen={isFull}
      slotProps={{ ...slotProps, paper: { ...paper, sx: paperSx } }}
    >
      {children}
    </Dialog>
  );
}
