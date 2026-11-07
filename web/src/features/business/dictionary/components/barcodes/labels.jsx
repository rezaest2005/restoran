import { createPortal } from "react-dom";
import BarcodeSvg from "./BarcodeSvg";
import { PRESETS } from "./presets";

// Labels are physical stickers: black on white regardless of the app theme.
const INK = "#000";
const PAPER = "#fff";

/** One sticker. Width/height are real millimetres (also on screen, so the preview is to scale). */
export function Label({ row, size, showName, showPrice, priceText }) {
  const fs = Math.max(6, Math.round(size.h / 4.2));
  return (
    <div style={{
      width: `${size.w}mm`, height: `${size.h}mm`, boxSizing: "border-box", padding: "1.2mm 1.5mm", overflow: "hidden",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
      background: PAPER, color: INK, breakInside: "avoid", pageBreakInside: "avoid",
    }}>
      {showName && (
        <div style={{ fontSize: `${fs}pt`, fontWeight: 700, lineHeight: 1.15, maxHeight: "2.4em", overflow: "hidden", textAlign: "center", width: "100%" }}>
          {row.name}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BarcodeSvg value={row.barcode} format={row.format} fontSize={Math.round(size.h * 0.8)} />
      </div>
      {showPrice && (
        <div style={{ fontSize: `${fs}pt`, fontWeight: 800, direction: "ltr" }}>{priceText(row.price)}</div>
      )}
    </div>
  );
}

/** Splits rows into sheets (A4) or single labels (roll presets). */
function chunk(rows, n) {
  const out = [];
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out;
}

/** Print-only copy of every label, mounted on document.body while printing. */
export function PrintRoot({ rows, preset, showName, showPrice, priceText }) {
  const size = PRESETS[preset];
  const page = size.a4
    ? "@page { size: A4; margin: 0; }"
    : `@page { size: ${size.w}mm ${size.h}mm; margin: 0; }`;
  const css = `
    #label-print-root { display: none; }
    @media print {
      ${page}
      html, body { margin: 0 !important; padding: 0 !important; background: ${PAPER} !important; }
      body > *:not(#label-print-root) { display: none !important; }
      #label-print-root { display: block !important; direction: ltr; }
      #label-print-root .sheet { break-after: page; page-break-after: always; }
      #label-print-root .sheet:last-child { break-after: auto; page-break-after: auto; }
      ${size.a4 ? `#label-print-root .sheet { display: grid; grid-template-columns: repeat(${size.cols}, ${size.w}mm); grid-auto-rows: ${size.h}mm; width: 210mm; height: 297mm; align-content: start; justify-content: center; padding-top: 0; }` : ""}
    }`;
  const groups = size.a4 ? chunk(rows, size.cols * size.rows) : rows.map((r) => [r]);
  return createPortal(
    <div id="label-print-root">
      <style>{css}</style>
      {groups.map((g, i) => (
        <div className="sheet" key={i}>
          {g.map((r, j) => <Label key={`${r.id}-${j}`} row={r} size={size} showName={showName} showPrice={showPrice} priceText={priceText} />)}
        </div>
      ))}
    </div>,
    document.body,
  );
}
