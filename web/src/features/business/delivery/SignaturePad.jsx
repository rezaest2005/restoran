import { useEffect, useRef } from "react";
import { Box, Button } from "@mui/material";

/**
 * Finger / mouse signature on a canvas (pointer events). Calls onChange(dataUrl | "") after each stroke.
 * Own small implementation; no library.
 */
export default function SignaturePad({ C, onChange, clearLabel, height = 160 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    cv.width = cv.offsetWidth * ratio;
    cv.height = height * ratio;
    const ctx = cv.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
  }, [height]);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const ctx = ref.current.getContext("2d");
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext("2d");
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const cv = ref.current;
    const ctx = cv.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.restore();
    dirty.current = false;
    onChange("");
  };

  return (
    <Box>
      <Box component="canvas" ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        sx={{ width: "100%", height, display: "block", borderRadius: 2, border: `1px dashed ${C.divider}`, touchAction: "none", bgcolor: "#fff" }} />
      <Button size="small" onClick={clear} sx={{ mt: 0.5, color: C.sub, textTransform: "none" }}>{clearLabel}</Button>
    </Box>
  );
}
