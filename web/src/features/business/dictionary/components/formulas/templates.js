/* Industry starting points for a formula. Pure data (names in both languages);
   components are matched to existing items by name, the rest can be created in one click. */

const S = (fa, en, o = {}) => ({ name: { fa, en }, ...o });
const P = (fa, en, quantity, unit, type = "raw", stage = null) => ({ name: { fa, en }, quantity, unit, type, stage });

export const TEMPLATES = [
  {
    key: "restaurant",
    icon: "🍔",
    batch: 1,
    stages: [
      S("آماده‌سازی", "Prep", { workstation: { fa: "میز کار", en: "Prep table" }, setup_minutes: 5, run_minutes: 3, capacity: 4 }),
      S("پخت", "Cook", { workstation: { fa: "گریل", en: "Grill" }, run_minutes: 8, capacity: 6, quality_check: { fa: "دمای مغز گوشت ۷۰ درجه", en: "Core temperature 70 °C" } }),
      S("چیدمان و سرو", "Plate", { workstation: { fa: "پاس", en: "Pass" }, run_minutes: 1, capacity: 1 }),
    ],
    components: [
      P("نان همبرگر", "Burger bun", 1, "unit", "raw", 2),
      P("گوشت همبرگر", "Beef patty", 1, "unit", "semi_finished", 1),
      P("پنیر ورقه‌ای", "Cheese slice", 20, "g", "raw", 2),
      P("کاهو", "Lettuce", 15, "g", "raw", 0),
      P("گوجه", "Tomato", 25, "g", "raw", 0),
      P("سس", "Sauce", 20, "g", "semi_finished", 2),
      P("جعبه بیرون‌بر", "Takeaway box", 1, "unit", "packaging", 2),
    ],
  },
  {
    key: "bakery",
    icon: "🥖",
    batch: 20,
    stages: [
      S("توزین", "Weigh", { setup_minutes: 5, run_minutes: 10 }),
      S("خمیرگیری", "Mix", { workstation: { fa: "میکسر", en: "Mixer" }, run_minutes: 15 }),
      S("استراحت خمیر", "Proof", { run_minutes: 60 }),
      S("پخت", "Bake", { workstation: { fa: "فر", en: "Oven" }, setup_minutes: 15, run_minutes: 35, quality_check: { fa: "رنگ طلایی، صدای توخالی", en: "Golden crust, hollow sound" } }),
      S("خنک کردن", "Cool", { run_minutes: 30 }),
      S("بسته‌بندی", "Pack", { run_minutes: 0.5, capacity: 1 }),
    ],
    components: [
      P("آرد", "Flour", 10, "kg", "raw", 1),
      P("آب", "Water", 6, "l", "raw", 1),
      P("مخمر", "Yeast", 100, "g", "raw", 1),
      P("نمک", "Salt", 200, "g", "raw", 1),
      P("شکر", "Sugar", 300, "g", "raw", 1),
      P("کیسه نان", "Bread bag", 20, "unit", "packaging", 5),
    ],
  },
  {
    key: "detergent",
    icon: "🧴",
    batch: 1000,
    stages: [
      S("توزین مواد", "Weigh", { workstation: { fa: "باسکول", en: "Scale" }, setup_minutes: 15, run_minutes: 20, capacity: 1000 }),
      S("اختلاط", "Mix", { workstation: { fa: "مخزن همزن", en: "Mixing tank" }, setup_minutes: 10, run_minutes: 45, capacity: 1000 }),
      S("گرم کردن", "Heat", { workstation: { fa: "مخزن همزن", en: "Mixing tank" }, run_minutes: 30, capacity: 1000, instructions: { fa: "تا ۷۰ درجه", en: "Up to 70 °C" } }),
      S("کنترل کیفیت", "Quality check", { workstation: { fa: "آزمایشگاه", en: "Lab" }, run_minutes: 15, capacity: 1000, quality_check: { fa: "pH بین ۶٫۵ تا ۷٫۵، گرانروی", en: "pH 6.5–7.5, viscosity" } }),
      S("پرکنی", "Fill", { workstation: { fa: "دستگاه پرکن", en: "Filling machine" }, setup_minutes: 15, run_minutes: 0.05, capacity: 1 }),
      S("برچسب‌زنی", "Label", { workstation: { fa: "برچسب‌زن", en: "Labeller" }, run_minutes: 0.03, capacity: 1 }),
      S("بسته‌بندی کارتن", "Pack", { run_minutes: 0.5, capacity: 12 }),
    ],
    components: [
      P("آب", "Water", 850, "l", "raw", 1),
      P("SLES", "SLES", 120, "kg", "raw", 1),
      P("CAPB", "CAPB", 30, "kg", "raw", 1),
      P("نمک", "Salt", 15, "kg", "raw", 2),
      P("اسانس", "Fragrance", 3, "kg", "raw", 2),
      P("رنگ", "Colour", 50, "g", "raw", 2),
      P("بطری ۱ لیتری", "1 L bottle", 1000, "unit", "packaging", 4),
      P("برچسب", "Label", 1000, "unit", "packaging", 5),
      P("کارتن ۱۲تایی", "Carton (12)", 84, "unit", "packaging", 6),
    ],
  },
  {
    key: "cosmetics",
    icon: "🧴",
    batch: 1000,
    stages: [
      S("گرم کردن فاز روغنی", "Heat oil phase", { workstation: { fa: "بن‌ماری", en: "Water bath" }, run_minutes: 20, capacity: 1000 }),
      S("گرم کردن فاز آبی", "Heat water phase", { workstation: { fa: "بن‌ماری", en: "Water bath" }, run_minutes: 20, capacity: 1000 }),
      S("امولسیون کردن", "Emulsify", { workstation: { fa: "هموژنایزر", en: "Homogeniser" }, setup_minutes: 10, run_minutes: 15, capacity: 1000 }),
      S("خنک کردن و افزودن مواد مؤثر", "Cool & add actives", { run_minutes: 40, capacity: 1000 }),
      S("کنترل کیفیت", "Quality check", { run_minutes: 15, capacity: 1000, quality_check: { fa: "pH، گرانروی، بو و رنگ", en: "pH, viscosity, odour, colour" } }),
      S("پرکنی ظرف", "Fill jars", { workstation: { fa: "پرکن", en: "Filler" }, setup_minutes: 10, run_minutes: 0.1, capacity: 1 }),
    ],
    components: [
      P("آب مقطر", "Distilled water", 35, "kg", "raw", 1),
      P("روغن‌ها", "Oils", 8, "kg", "raw", 0),
      P("امولسیفایر", "Emulsifier", 3, "kg", "raw", 0),
      P("گلیسرین", "Glycerin", 2.5, "kg", "raw", 1),
      P("نگهدارنده", "Preservative", 500, "g", "raw", 3),
      P("اسانس", "Fragrance", 200, "g", "raw", 3),
      P("ظرف ۵۰ گرمی", "50 g jar", 1000, "unit", "packaging", 5),
    ],
  },
  {
    key: "assembly",
    icon: "🔧",
    batch: 1,
    stages: [
      S("آماده‌سازی قطعات", "Kitting", { run_minutes: 3, capacity: 1 }),
      S("مونتاژ", "Assembly", { workstation: { fa: "میز مونتاژ", en: "Assembly bench" }, run_minutes: 12, capacity: 1 }),
      S("تست", "Test", { workstation: { fa: "میز تست", en: "Test bench" }, run_minutes: 5, capacity: 1, quality_check: { fa: "تست عملکرد", en: "Functional test" } }),
      S("بسته‌بندی", "Pack", { run_minutes: 2, capacity: 1 }),
    ],
    components: [
      P("بدنه", "Housing", 1, "unit", "raw", 1),
      P("برد", "Board", 1, "unit", "semi_finished", 1),
      P("پیچ", "Screw", 4, "unit", "raw", 1),
      P("جعبه", "Box", 1, "unit", "packaging", 3),
    ],
  },
];

/** Pick the right language from a {fa, en} pair. */
export const pick = (v, lang) => (v && typeof v === "object" ? (v[lang] ?? v.fa ?? v.en ?? "") : (v ?? ""));

/** Match a name against items (exact, then contains) — same idea as the server parser. */
export const matchItem = (name, items) => {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  const exact = items.find((m) => String(m.name).trim().toLowerCase() === key);
  if (exact) return exact;
  const part = items.filter((m) => {
    const k = String(m.name).trim().toLowerCase();
    return k.includes(key) || (k.length > 2 && key.includes(k));
  });
  part.sort((a, b) => a.name.length - b.name.length);
  return part[0] || null;
};

/** Template → draft { industry, batch, stages, components } in the current language. */
export const templateDraft = (tpl, lang) => ({
  industry: tpl.key,
  batch: tpl.batch,
  stages: tpl.stages.map((s) => ({
    name: pick(s.name, lang), workstation: pick(s.workstation, lang),
    setup_minutes: s.setup_minutes ?? 0, run_minutes: s.run_minutes ?? 0, capacity: s.capacity ?? 0,
    instructions: pick(s.instructions, lang), quality_check: pick(s.quality_check, lang),
  })),
  components: tpl.components.map((c) => ({
    name: pick(c.name, lang), altNames: [c.name.fa, c.name.en], quantity: c.quantity, unit: c.unit,
    type: c.type, stageIndex: c.stage,
  })),
});
