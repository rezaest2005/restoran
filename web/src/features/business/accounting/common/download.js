const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build a CSV client-side and download it through a temporary anchor. Returns true on success. */
export function downloadCsv(filename, rows) {
  try {
    const text = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

const xmlEsc = (v) => String(v ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/**
 * Excel download without any library: SpreadsheetML 2003 (opens in Excel / LibreOffice / Google Sheets).
 * Numbers stay numeric so sums work in the spreadsheet; `rtl` flips the sheet for Persian.
 */
export function downloadExcel(filename, rows, { sheet = "Report", rtl = false } = {}) {
  try {
    const cell = (v) => {
      const isNum = typeof v === "number" && Number.isFinite(v);
      return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${xmlEsc(v)}</Data></Cell>`;
    };
    const body = rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("");
    const xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
      + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
      + `<Worksheet ss:Name="${xmlEsc(sheet).slice(0, 31)}"${rtl ? ' ss:RightToLeft="1"' : ""}><Table>${body}</Table>`
      + `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">${rtl ? "<DisplayRightToLeft/>" : ""}</WorksheetOptions>`
      + "</Worksheet></Workbook>";
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/\.(csv|xlsx?)$/i, "") + ".xls";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Parse a pasted/uploaded CSV (comma, semicolon or tab separated; quoted fields). */
export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/)[0] || "";
  const sep = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}
