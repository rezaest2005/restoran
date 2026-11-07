import { Autocomplete, TextField, Box, Typography, createFilterOptions } from "@mui/material";
import { TypeBadge } from "../../common";
import { fmtNum } from "../../common";

const filter = createFilterOptions();

/**
 * Searchable item select with an inline "create" entry.
 * options: [{ id, name, unit, quantity, material_type }]; value: id string.
 */
export default function ItemPicker({ ctx, options, value, onChange, onCreate, label, error, helperText, size = "small", autoFocus }) {
  const { t, C, S } = ctx;
  const selected = options.find((o) => String(o.id) === String(value)) || null;
  return (
    <Autocomplete
      size={size} options={options} value={selected} autoHighlight autoFocus={autoFocus}
      getOptionLabel={(o) => (o?.__create ? o.name : o?.name || "")}
      isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
      filterOptions={(opts, state) => {
        const out = filter(opts, state);
        const text = state.inputValue.trim();
        if (onCreate && text && !opts.some((o) => o.name.toLowerCase() === text.toLowerCase())) {
          out.push({ __create: true, name: text, id: "__create__" });
        }
        return out;
      }}
      onChange={(_, v) => {
        if (!v) onChange("");
        else if (v.__create) onCreate(v.name);
        else onChange(String(v.id));
      }}
      noOptionsText={t("ui_def.formulas.no_items")}
      renderOption={(props, o) => {
        const { key, ...rest } = props;
        if (o.__create) {
          return (
            <li key={key} {...rest}>
              <Typography sx={{ color: C.primary, fontWeight: 700, fontSize: 13 }}>
                + {t("ui_def.formulas.create_item", { name: o.name })}
              </Typography>
            </li>
          );
        }
        return (
          <li key={key} {...rest}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", width: "100%" }}>
              <span>{o.name}</span>
              <TypeBadge t={t} C={C} type={o.material_type} />
              <Typography sx={{ color: C.muted, fontSize: 11, marginInlineStart: "auto" }}>
                {fmtNum(o.quantity)} {t(`ui_def.units.${o.unit}`, { defaultValue: o.unit })}
              </Typography>
            </Box>
          </li>
        );
      }}
      renderInput={(p) => <TextField {...p} label={label} sx={S.field} error={error} helperText={helperText} />}
    />
  );
}
