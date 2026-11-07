import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, MenuItem, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

const COLORS = ["primary", "accent", "background", "surface", "text", "muted"];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function lum(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const ch = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)];
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}

function ColorRow({ name, value, onChange }) {
  const { t } = useTranslation();
  const valid = HEX.test(value || "");
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <input type="color" aria-label={t(`ui_k.theme.${name}`)} value={valid && value.length === 7 ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)} style={{ width: 44, height: 36, border: 0, padding: 0, background: "none" }} />
      <TextField size="small" label={t(`ui_k.theme.${name}`)} value={value || ""} error={!valid}
        helperText={valid ? "" : t("ui_k.theme.hex_invalid")}
        onChange={(e) => onChange(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { dir: "ltr", maxLength: 7 } }} />
    </Stack>
  );
}

export default function ThemeTab({ theme, language, fonts, templates, current, onTheme, onLanguage, onTemplate }) {
  const { t } = useTranslation();
  const warnings = [];
  [["text", "background"], ["text", "surface"], ["muted", "background"]].forEach(([fg, bg]) => {
    if (HEX.test(theme[fg] || "") && HEX.test(theme[bg] || "")) {
      const ratio = contrast(theme[fg], theme[bg]);
      if (ratio < 4.5) warnings.push({ fg, bg, ratio });
    }
  });
  const set = (k, v) => onTheme({ ...theme, [k]: v });

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t("ui_k.theme.templates")}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 1.5 }}>
          {templates.map((tp) => (
            <Box key={tp.key} sx={{ border: 2, borderColor: current === tp.key ? "primary.main" : "divider", borderRadius: 2, p: 1 }}>
              <Stack direction="row" sx={{ height: 28, borderRadius: 1, overflow: "hidden", mb: 1 }} aria-hidden>
                {["background", "surface", "primary", "accent", "text"].map((k) => (
                  <Box key={k} sx={{ flex: 1, bgcolor: tp.default_theme[k] }} />
                ))}
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {document.documentElement.lang === "en" ? tp.name_en : tp.name_fa}
              </Typography>
              <Button size="small" onClick={() => onTemplate(tp.key)} sx={{ mt: 0.5 }}>{t("ui_k.theme.apply_template")}</Button>
            </Box>
          ))}
        </Box>
      </Box>

      <Stack spacing={1.5}>
        {COLORS.map((k) => <ColorRow key={k} name={k} value={theme[k]} onChange={(v) => set(k, v)} />)}
        {warnings.map((w) => (
          <Alert key={w.fg + w.bg} severity="warning">
            {t("ui_k.theme.contrast_warning", { fg: t(`ui_k.theme.${w.fg}`), bg: t(`ui_k.theme.${w.bg}`), ratio: w.ratio })}
          </Alert>
        ))}
      </Stack>

      <TextField select size="small" label={t("ui_k.theme.font_family")} value={theme.font_family || ""}
        onChange={(e) => set("font_family", e.target.value)}>
        {fonts.map((f) => <MenuItem key={f} value={f} sx={{ fontFamily: f }}>{f}</MenuItem>)}
      </TextField>

      <Box>
        <Typography variant="body2">{t("ui_k.theme.radius")}: {theme.radius ?? 12}px</Typography>
        <Slider min={0} max={32} step={1} value={theme.radius ?? 12} onChange={(_, v) => set("radius", v)}
          aria-label={t("ui_k.theme.radius")} />
      </Box>

      <Box>
        <Typography variant="body2" sx={{ mb: 0.5 }}>{t("ui_k.theme.density")}</Typography>
        <ToggleButtonGroup exclusive size="small" value={theme.density || "comfortable"}
          onChange={(_, v) => v && set("density", v)}>
          {["compact", "comfortable", "spacious"].map((d) => (
            <ToggleButton key={d} value={d}>{t(`ui_k.theme.density_${d}`)}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <TextField select size="small" label={t("ui_k.theme.language")} value={language}
        onChange={(e) => onLanguage(e.target.value)}>
        <MenuItem value="fa">فارسی</MenuItem>
        <MenuItem value="en">English</MenuItem>
      </TextField>
    </Stack>
  );
}
