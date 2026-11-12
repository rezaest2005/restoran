// بررسی اینکه هر کلید ترجمه‌ی ثابت در هر دو زبان وجود دارد
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..") + path.sep;
const L = ROOT + "src/i18n/locales/";
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

function build(lang) {
  const o = load(L + lang + ".json");
  for (const f of fs.readdirSync(L + "parts").filter((x) => x.endsWith("." + lang + ".json"))) {
    Object.assign(o, load(L + "parts/" + f));
  }
  return o;
}

const R = { fa: build("fa"), en: build("en") };
const has = (o, k) =>
  k.split(".").reduce((a, p) => (a && typeof a === "object" ? a[p] : undefined), o) !== undefined;

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(jsx?|mjs)$/.test(e.name) ? [full] : [];
  });

const miss = {};
const re = /\bt\(\s*["']([A-Za-z0-9_.]+)["']/g;
for (const f of walk(ROOT + "src")) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(re)) {
    const k = m[1];
    if (!k.includes(".")) continue;
    for (const lang of ["fa", "en"]) {
      if (!has(R[lang], k)) {
        const key = lang + " " + k;
        (miss[key] = miss[key] || new Set()).add(f.split("src").pop().replace(/\\/g, "/"));
      }
    }
  }
}
const keys = Object.keys(miss);
console.log("missing static keys:", keys.length);
process.exitCode = keys.length ? 1 : 0;
keys.slice(0, 60).forEach((k) => console.log(" ", k, "<-", [...miss[k]].join(", ")));
