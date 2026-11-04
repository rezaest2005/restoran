"""Industry neutrality: user-visible text must not be restaurant specific."""
import json
import re
from pathlib import Path

from django.test import SimpleTestCase

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "web" / "src" / "i18n" / "locales"
TEMPLATES = ROOT / "dashboard" / "bizsuite" / "templates"

FORBIDDEN = re.compile(r"رستوران|restaurant|غذا|آشپز|گارسون|\bchef\b|\bwaiter\b|\bmenu\b|منو", re.I)
# strings that legitimately mention these words are listed here (none right now)
ALLOWED_KEYS = set()


def _walk(obj, path=()):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk(v, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk(v, path + (str(i),))
    elif isinstance(obj, str):
        yield ".".join(path), obj


class NeutralityTests(SimpleTestCase):
    def test_locale_files_have_no_food_or_restaurant_wording(self):
        bad = []
        for f in sorted(LOCALES.rglob("*.json")):
            for key, value in _walk(json.loads(f.read_text(encoding="utf-8"))):
                if key in ALLOWED_KEYS:
                    continue
                if FORBIDDEN.search(value):
                    bad.append(f"{f.name}:{key}={value[:40]}")
        self.assertEqual(bad, [])

    def test_legacy_templates_have_no_food_wording(self):
        bad = []
        for f in TEMPLATES.rglob("*.html"):
            text = f.read_text(encoding="utf-8")
            if re.search(r"رستوران|غذا", text):
                bad.append(f.name)
        self.assertEqual(bad, [])

    def test_branding_is_neutral(self):
        from core import branding
        self.assertNotRegex(branding.APP_NAME + branding.APP_NAME_FA, FORBIDDEN)
