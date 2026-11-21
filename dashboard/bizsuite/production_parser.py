"""
«کارت را توصیف کن» — تبدیل قطعی (بدون هوش مصنوعی) متن ساده به پیش‌نویس مراحل و مواد.

هر خط (یا «سپس» / «then») یک مرحله است. در هر خط:
  - «عدد + واحد زمان» (۱۵ دقیقه، 2 h) → زمان مرحله
  - «عدد + واحد مقدار + نام» (۱۰ کیلو آب، 2kg SLES، ۳ عدد تخم‌مرغ) → ماده‌ی مصرفی
  - «عدد + درجه / °C» → فقط در دستورالعمل می‌ماند
  - «در / داخل / in / using + نام» → ایستگاه / دستگاه
  - باقی کلمه‌ها (به‌جز حروف ربط) → نام مرحله (مخلوط کن، mix، heat)
نتیجه فقط پیش‌نویس است؛ کاربر قبل از ذخیره تأییدش می‌کند.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫", "01234567890123456789.")
_ARABIC = str.maketrans({"ي": "ی", "ك": "ک", "ة": "ه"})

MAX_LINES = 60
MAX_CHARS = 6000

DURATION_UNITS = {
    "min": 1, "mins": 1, "minute": 1, "minutes": 1, "m": None,  # «m» مبهم: متر یا دقیقه
    "h": 60, "hr": 60, "hrs": 60, "hour": 60, "hours": 60,
    "s": Decimal("1") / 60, "sec": Decimal("1") / 60, "secs": Decimal("1") / 60,
    "second": Decimal("1") / 60, "seconds": Decimal("1") / 60,
    "دقیقه": 1, "دقیقه‌ای": 1, "ساعت": 60, "ثانیه": Decimal("1") / 60,
}

QTY_UNITS = {
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
    "کیلو": "kg", "کیلوگرم": "kg", "کیلویی": "kg",
    "g": "g", "gr": "g", "gram": "g", "grams": "g", "گرم": "g",
    "ton": "ton", "tons": "ton", "tonne": "ton", "تن": "ton",
    "l": "l", "lt": "l", "lit": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
    "لیتر": "l",
    "ml": "ml", "cc": "ml", "milliliter": "ml", "milliliters": "ml", "میلی‌لیتر": "ml",
    "میلی": "ml", "سی‌سی": "ml",
    "pc": "piece", "pcs": "piece", "piece": "piece", "pieces": "piece", "x": "unit",
    "unit": "unit", "units": "unit", "عدد": "unit", "تا": "unit", "دانه": "unit", "تکه": "piece",
    "dozen": "dozen", "دوجین": "dozen",
    "meter": "meter", "meters": "meter", "متر": "meter", "cm": "cm", "سانت": "cm",
    "pack": "pack", "packs": "pack", "بسته": "pack", "box": "box", "boxes": "box", "جعبه": "box",
    "roll": "roll", "rolls": "roll", "رول": "roll", "sheet": "sheet", "sheets": "sheet", "ورق": "sheet",
}

TEMP_UNITS = {"°", "°c", "c", "degree", "degrees", "deg", "درجه", "سانتیگراد", "سانتی‌گراد", "f", "°f"}

STOP_WORDS = {
    "with", "and", "for", "of", "the", "a", "an", "to", "into", "then", "until", "about",
    "add", "plus", "at", "&", "approximately",
    "و", "با", "را", "به", "برای", "از", "مدت", "سپس", "بعد", "حدود", "تقریبا", "تقریباً",
    "همراه", "دمای", "دما", "روی", "تا",
}
STATION_MARKERS = {"in", "using", "on", "inside", "در", "داخل", "توی", "دستگاه"}
NAME_SKIP_LEAD = {"of", "از", "the"}

_TOKEN = re.compile(r"\d+(?:\.\d+)?|°[cf]?|[^\W\d_]+(?:[‌\-][^\W\d_]+)*|[^\s\w]", re.UNICODE | re.IGNORECASE)
_SPLIT = re.compile(r"[\r\n;]+|\s+(?:then|سپس|و\s+بعد|بعد\s+از\s+آن)\s+", re.IGNORECASE)


def normalize(text: str) -> str:
    return str(text or "").translate(_DIGITS).translate(_ARABIC).replace(" ", " ")


def _num(tok):
    try:
        return Decimal(tok)
    except (InvalidOperation, ValueError):
        return None


def _is_num(tok):
    return bool(re.fullmatch(r"\d+(?:\.\d+)?", tok))


def _is_word(tok):
    return bool(re.match(r"[^\W\d_]", tok, re.UNICODE))


def parse_line(line: str):
    toks = _TOKEN.findall(line)
    low = [t.lower() for t in toks]
    stage_words, components, station = [], [], []
    minutes = Decimal("0")
    i = 0
    n = len(toks)
    while i < n:
        t, lt = toks[i], low[i]
        if _is_num(t):
            value = _num(t)
            nxt = low[i + 1] if i + 1 < n else ""
            # «m» بعد از عدد: اگر نامی بعدش آمد متر است، وگرنه دقیقه
            if nxt == "m":
                after = low[i + 2] if i + 2 < n else ""
                if after and _is_word(after) and after not in STOP_WORDS:
                    nxt_unit = "meter"
                    i += 2
                    name, i = _take_name(toks, low, i)
                    components.append({"name": name, "quantity": value, "unit": nxt_unit})
                    continue
                minutes += value
                i += 2
                continue
            if nxt in DURATION_UNITS and DURATION_UNITS[nxt] is not None:
                minutes += value * Decimal(DURATION_UNITS[nxt])
                i += 2
                continue
            if nxt in TEMP_UNITS:
                i += 2
                if i < n and low[i] in {"c", "f"}:
                    i += 1
                continue
            if nxt in QTY_UNITS:
                unit = QTY_UNITS[nxt]
                i += 2
                name, i = _take_name(toks, low, i)
                if name:
                    components.append({"name": name, "quantity": value, "unit": unit})
                continue
            if nxt and _is_word(nxt) and nxt not in STOP_WORDS:
                i += 1
                name, i = _take_name(toks, low, i)
                if name:
                    components.append({"name": name, "quantity": value, "unit": "unit"})
                continue
            i += 1
            continue
        if lt in STATION_MARKERS and i + 1 < n and _is_word(toks[i + 1]) and low[i + 1] not in STOP_WORDS \
                and low[i + 1] not in DURATION_UNITS:
            j = i + 1
            words = []
            while j < n and _is_word(toks[j]) and low[j] not in STOP_WORDS and len(words) < 3 \
                    and low[j] not in STATION_MARKERS:
                words.append(toks[j])
                j += 1
            # فارسی: «در میکسر مخلوط کن» — فقط کلمه‌ی اول ایستگاه است، فعل نام مرحله
            if lt in {"در", "داخل", "توی", "دستگاه"} and len(words) > 1:
                words = words[:1]
                j = i + 2
            station = words
            i = j
            continue
        if _is_word(t) and lt not in STOP_WORDS:
            stage_words.append(t)
        i += 1
    return {
        "name": " ".join(stage_words).strip()[:120],
        "workstation": " ".join(station).strip()[:120],
        "run_minutes": minutes.quantize(Decimal("0.01")),
        "components": components,
        "instructions": line.strip()[:2000],
    }


def _take_name(toks, low, i):
    n = len(toks)
    while i < n and low[i] in NAME_SKIP_LEAD:
        i += 1
    words = []
    while i < n and len(words) < 4:
        t, lt = toks[i], low[i]
        if not _is_word(t) or lt in STOP_WORDS or lt in STATION_MARKERS:
            break
        words.append(t)
        i += 1
    return " ".join(words), i


def parse_process(text: str, materials=()):
    """
    text → {"stages": [...], "components": [...]}؛ materials: [(id, name, unit)] برای تطبیق نام.
    """
    text = normalize(text)[:MAX_CHARS]
    by_name = {}
    for mid, name, unit in materials:
        by_name.setdefault(normalize(name).strip().lower(), (mid, name, unit))

    def match(name):
        key = name.strip().lower()
        if not key:
            return None
        if key in by_name:
            return by_name[key]
        candidates = [v for k, v in by_name.items() if key in k or (len(k) > 2 and k in key)]
        return min(candidates, key=lambda v: len(v[1])) if candidates else None

    stages, totals = [], {}
    for raw in _SPLIT.split(text):
        line = raw.strip(" .-•*\t")
        if not line:
            continue
        if len(stages) >= MAX_LINES:
            break
        st = parse_line(line)
        if not st["name"] and not st["components"] and not st["run_minutes"]:
            continue
        if not st["name"]:
            st["name"] = f"#{len(stages) + 1}"
        for c in st["components"]:
            m = match(c["name"])
            c["material_id"] = m[0] if m else None
            c["material"] = m[1] if m else None
            c["material_unit"] = m[2] if m else None
            key = (c["material_id"] or c["name"].lower(), c["unit"])
            if key in totals:
                totals[key]["quantity"] += c["quantity"]
            else:
                totals[key] = dict(c)
        stages.append(st)
    for i, st in enumerate(stages, start=1):
        st["sequence"] = i
    return {"stages": stages, "components": list(totals.values())}
