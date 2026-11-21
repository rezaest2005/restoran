import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Step, StepLabel, Stepper, TextField, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useLang } from "@shared/contexts/LangContext";
import { fetchSetup, saveSetup } from "../api";
import { setBusinessTerms } from "../terms";

/**
 * First-run setup wizard: business type → modules in use → basic info.
 * Flow inspired by the ERPNext / Frappe Books setup wizards (ideas only, GPL/AGPL — no code taken).
 * Never changes licensing: modules that are not bought are only sent as a request (see views/dashboard/setup.py).
 */
export default function SetupWizard({ open, onClose, onSaved }) {
  const { t } = useTranslation();
  const { lang } = useLang();
  const en = lang === "en";
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [setup, setSetup] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState("");
  const [mods, setMods] = useState([]);
  const [modsTouched, setModsTouched] = useState(false);
  const [info, setInfo] = useState({ name: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchSetup()
      .then((d) => {
        if (!alive || !d) return;
        setLoadError(false);
        setSetup(d);
        setIndustry(d.industry || "");
        const used = Array.isArray(d.used_modules) && d.used_modules.length ? d.used_modules : null;
        setMods(used ? [...used, ...(d.requested_modules || [])]
          : d.modules.filter((m) => m.live).map((m) => m.code));
        setModsTouched(!!used);
        setInfo({ name: d.profile?.name || "", phone: d.profile?.phone || "", address: d.profile?.address || "" });
        setStep(0);
        setError("");
      })
      .catch(() => alive && setLoadError(true));
    return () => { alive = false; };
  }, [open]);

  const preset = useMemo(() => setup?.industries?.find((i) => i.key === industry), [setup, industry]);
  const modName = (code) => {
    const m = setup?.modules?.find((x) => x.code === code);
    return m ? (en ? m.name_en : m.name_fa) : code;
  };

  const pickIndustry = (key) => {
    setIndustry(key);
    if (!modsTouched && setup) {
      const p = setup.industries.find((i) => i.key === key);
      const live = setup.modules.filter((m) => m.live).map((m) => m.code);
      // suggested modules the business has; if none of them is live keep everything live
      const sugg = (p?.modules || []).filter((c) => live.includes(c));
      setMods(sugg.length ? sugg : live);
    }
  };

  const toggle = (code) => {
    setModsTouched(true);
    setMods((cur) => {
      if (cur.includes(code)) {
        // unticking a module also unticks modules that need it
        const dependants = setup.modules.filter((m) => m.requires.includes(code)).map((m) => m.code);
        return cur.filter((c) => c !== code && !dependants.includes(c));
      }
      const req = setup.modules.find((m) => m.code === code)?.requires || [];
      return [...new Set([...cur, code, ...req])];
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await saveSetup({ industry, used_modules: mods, ...info, complete: true });
      setBusinessTerms(d?.terms, { business_industry: d?.industry || industry, setup_required: false });
      onSaved?.(d);
    } catch (e) {
      setError(e?.response?.data?.error || e?.response?.data?.message || t("ui_dash2.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const canEdit = !!setup?.can_edit;
  const steps = [t("ui_dash2.step_type"), t("ui_dash2.step_modules"), t("ui_dash2.step_info")];
  const canNext = step === 0 ? !!industry : step === 1 ? true : info.name.trim().length > 0;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" fullScreen={fullScreen}
      aria-labelledby="setup-wizard-title">
      <DialogTitle id="setup-wizard-title" sx={{ fontWeight: 800 }}>
        {t("ui_dash2.setup_title")}
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>{t("ui_dash2.setup_intro")}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {loadError && <Alert severity="error">{t("ui_dash2.save_failed")}</Alert>}
        {!setup && !loadError && <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress /></Box>}
        {setup && !canEdit && <Alert severity="info">{t("ui_dash2.not_owner")}</Alert>}
        {setup && canEdit && (
          <>
            <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
              {steps.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
            </Stepper>

            {step === 0 && (
              <Box role="radiogroup" aria-label={t("ui_dash2.business_type")}
                sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" } }}>
                {setup.industries.map((i) => {
                  const selected = industry === i.key;
                  return (
                    <Box key={i.key} component="button" type="button" role="radio" aria-checked={selected}
                      onClick={() => pickIndustry(i.key)}
                      sx={{
                        textAlign: "start", p: 1.75, borderRadius: 2, cursor: "pointer", font: "inherit",
                        bgcolor: selected ? "primary.light" : "background.paper", color: "text.primary",
                        border: 2, borderColor: selected ? "primary.main" : "divider",
                        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                      }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{en ? i.name_en : i.name_fa}</Typography>
                      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                        {en ? i.description_en : i.description_fa}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}

            {step === 1 && (
              <Box>
                <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>{t("ui_dash2.modules_hint")}</Typography>
                <Box sx={{ display: "grid", gap: 0.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  {setup.modules.map((m) => (
                    <Box key={m.code} sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                      <FormControlLabel
                        control={<Checkbox checked={mods.includes(m.code)} onChange={() => toggle(m.code)} />}
                        label={en ? m.name_en : m.name_fa}
                      />
                      {preset?.modules?.includes(m.code) && <Chip size="small" color="primary" variant="outlined" label={t("ui_dash2.suggested")} />}
                      {!m.live && <Chip size="small" variant="outlined" label={t("ui_dash2.not_licensed")} />}
                      {m.requires.length > 0 && (
                        <Typography sx={{ fontSize: 11, color: "text.secondary", width: "100%", pl: 4 }}>
                          {t("ui_dash2.requires", { list: m.requires.map(modName).join("، ") })}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {step === 2 && (
              <Box sx={{ display: "grid", gap: 2, maxWidth: 520 }}>
                <TextField label={t("ui_dash2.name")} value={info.name} required autoFocus
                  onChange={(e) => setInfo({ ...info, name: e.target.value })} inputProps={{ maxLength: 200 }} />
                <TextField label={t("ui_dash2.phone")} value={info.phone} inputProps={{ maxLength: 20, dir: "ltr" }}
                  onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
                <TextField label={t("ui_dash2.address")} value={info.address} multiline minRows={2}
                  onChange={(e) => setInfo({ ...info, address: e.target.value })} />
              </Box>
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>{t("ui_dash2.later")}</Button>
        <Box sx={{ flex: 1 }} />
        {canEdit && step > 0 && (
          <Button onClick={() => setStep(step - 1)} disabled={saving} sx={{ textTransform: "none" }}>{t("ui_dash2.back")}</Button>
        )}
        {canEdit && step < 2 && (
          <Button variant="contained" onClick={() => setStep(step + 1)} disabled={!canNext} sx={{ textTransform: "none" }}>
            {t("ui_dash2.next")}
          </Button>
        )}
        {canEdit && step === 2 && (
          <Button variant="contained" onClick={save} disabled={!canNext || saving} sx={{ textTransform: "none" }}>
            {saving ? t("ui_dash2.saving") : t("ui_dash2.finish")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
