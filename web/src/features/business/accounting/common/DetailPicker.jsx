import { useMemo } from "react";
import { Autocomplete, TextField, Box } from "@mui/material";

const norm = (s) => String(s || "").toLowerCase();

/**
 * Searchable detail-account (تفصیلی) picker. `details` comes from ctx (loaded once by the page).
 * `kinds` optionally limits the list (e.g. ["customer","person"]). `value` is a detail object or null.
 */
export default function DetailPicker({ ctx, value, onChange, kinds, label, error, size = "small", autoFocus = false }) {
  const { t, C, S, details = [] } = ctx;
  const options = useMemo(
    () => details.filter((d) => d.is_active !== false && (!kinds || kinds.includes(d.kind))),
    [details, kinds],
  );
  return (
    <Autocomplete
      size={size} options={options} value={value || null}
      onChange={(_, v) => onChange(v)}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      getOptionLabel={(d) => `${d.code} — ${d.name}`}
      filterOptions={(opts, { inputValue }) => {
        const q = norm(inputValue).trim();
        if (!q) return opts.slice(0, 200);
        return opts.filter((d) => norm(d.code).includes(q) || norm(d.name).includes(q) || norm(d.phone).includes(q))
          .slice(0, 200);
      }}
      noOptionsText={t("ui_i.common.no_match")}
      openOnFocus
      renderOption={(props, d) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ minHeight: 40, gap: 1 }}>
            <Box component="span" dir="ltr" sx={{ color: C.muted, fontSize: 12, minWidth: 48 }}>{d.code}</Box>
            <span>{d.name}</span>
            <Box component="span" sx={{ color: C.muted, fontSize: 11, marginInlineStart: "auto" }}>
              {t(`acc2.detail_kinds.${d.kind}`)}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={t("acc2.details.pick")} error={!!error} sx={S.field}
          autoFocus={autoFocus} />
      )}
      sx={{ minWidth: 180 }}
    />
  );
}
