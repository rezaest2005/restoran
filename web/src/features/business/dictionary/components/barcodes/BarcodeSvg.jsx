import { useMemo } from "react";
import JsBarcode from "jsbarcode";

// Bars must be black on white to scan reliably, whatever the app theme is.
const BAR_COLOR = "#000000";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Renders the barcode into a detached <svg> and returns its markup (null when it cannot be encoded). */
function renderSvg(value, format, { showText, fontSize, barWidth, barHeight }) {
  const make = (fmt) => {
    const el = document.createElementNS(SVG_NS, "svg");
    JsBarcode(el, String(value), {
      format: fmt, displayValue: showText, fontSize, width: barWidth, height: barHeight, margin: 0,
      lineColor: BAR_COLOR, background: "transparent", textMargin: 2,
    });
    el.removeAttribute("width");
    el.removeAttribute("height");
    el.setAttribute("preserveAspectRatio", "xMidYMid meet");
    el.setAttribute("style", "width:100%;height:100%;display:block");
    return el.outerHTML;
  };
  try {
    return make(format === "ean13" ? "EAN13" : "CODE128");
  } catch {
    try {
      return make("CODE128"); // a value that is not a valid EAN-13 still prints as Code128
    } catch {
      return null;
    }
  }
}

/**
 * Barcode as SVG via jsbarcode: EAN-13 or Code128 (the server's `format`).
 * Scales to its container and keeps the aspect ratio.
 */
export default function BarcodeSvg({ value, format, showText = true, fontSize = 14, barWidth = 2, barHeight = 60 }) {
  const markup = useMemo(
    () => renderSvg(value, format, { showText, fontSize, barWidth, barHeight }),
    [value, format, showText, fontSize, barWidth, barHeight],
  );
  if (!markup) return <span style={{ color: BAR_COLOR, fontSize: 10 }}>{String(value)}</span>;
  return (
    <div role="img" aria-label={String(value)} style={{ width: "100%", height: "100%" }}
      dangerouslySetInnerHTML={{ __html: markup }} />
  );
}
