import { TextField } from "@mui/material";
import { formatMoney, parseMoney } from "./money";

/** Amount input: thousands separators live while typing, only digits accepted, the value is a plain integer. */
export default function MoneyField({ value, onChange, fa, slotProps, ...rest }) {
  return (
    <TextField
      {...rest}
      value={value ? formatMoney(value, fa) : ""}
      placeholder="0"
      onChange={(e) => onChange(parseMoney(e.target.value))}
      slotProps={{
        ...slotProps,
        htmlInput: { inputMode: "numeric", dir: "ltr", style: { textAlign: "start" }, autoComplete: "off", ...(slotProps?.htmlInput || {}) },
      }}
    />
  );
}
