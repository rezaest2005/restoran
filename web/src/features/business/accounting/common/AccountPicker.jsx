import { useMemo } from "react";
import { Autocomplete, TextField, Box } from "@mui/material";
import { accName } from "./format";

const norm = (s) => String(s || "").toLowerCase();

/**
 * Searchable account picker (by code or name, Persian or English).
 * `postableOnly` restricts to postable + active accounts. `value` is an account object or null.
 */
export default function AccountPicker({
  ctx, value, onChange, postableOnly = true, label, error, size = "small", autoFocus = false,
}) {
  const { t, C, S, lang, accounts } = ctx;
  const options = useMemo(
    () => accounts
      .filter((a) => (postableOnly ? a.is_postable && a.is_active : a.is_active))
      .sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true })),
    [accounts, postableOnly],
  );

  return (
    <Autocomplete
      size={size} options={options} value={value || null}
      onChange={(_, v) => onChange(v)}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      getOptionLabel={(a) => `${a.code} — ${accName(a, lang)}`}
      filterOptions={(opts, { inputValue }) => {
        const q = norm(inputValue).trim();
        if (!q) return opts;
        return opts.filter((a) => norm(a.code).includes(q) || norm(a.name).includes(q) || norm(a.name_en).includes(q));
      }}
      noOptionsText={t("ui_i.common.no_match")}
      openOnFocus
      renderOption={(props, a) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ minHeight: 40, gap: 1 }}>
            <Box component="span" dir="ltr" sx={{ color: C.muted, fontSize: 12, minWidth: 48 }}>{a.code}</Box>
            <span>{accName(a, lang)}</span>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params} label={label} placeholder={t("ui_i.common.pick_account")}
          error={!!error} sx={S.field} autoFocus={autoFocus}
        />
      )}
      sx={{ minWidth: 200 }}
    />
  );
}
