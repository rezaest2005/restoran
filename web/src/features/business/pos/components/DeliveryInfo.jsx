import { Box, TextField, MenuItem, FormControlLabel, Checkbox, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

/**
 * Extra fields for a courier ("پیک") order: where to deliver, which courier (optional — left empty the
 * order waits in the dispatch queue) and whether the customer pays the courier on arrival.
 */
export default function DeliveryInfo({ delivery, setDelivery, couriers, C }) {
  const { t } = useTranslation();
  const set = (k) => (e) => setDelivery((d) => ({ ...d, [k]: e.target.value }));
  const field = { "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13 } };
  return (
    <Box sx={{ display: "grid", gap: 1, mb: 1.5, p: 1.25, borderRadius: "12px", border: `1px solid ${C.accent}`, bgcolor: C.accentSubtle }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("ui_del.pos.title")}</Typography>
      <TextField
        size="small" required multiline minRows={2} label={t("ui_del.pos.address")}
        value={delivery.address} onChange={set("address")} sx={field}
        error={false}
      />
      {couriers.length > 0 && (
        <TextField select size="small" label={t("ui_del.pos.courier")} value={delivery.driverId} onChange={set("driverId")} sx={field}>
          <MenuItem value="">{t("ui_del.pos.courier_later")}</MenuItem>
          {couriers.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}{d.on_shift ? " ●" : ""}</MenuItem>)}
        </TextField>
      )}
      <FormControlLabel
        control={<Checkbox size="small" checked={delivery.cod} onChange={(e) => setDelivery((d) => ({ ...d, cod: e.target.checked }))} />}
        label={<Typography sx={{ fontSize: 12.5, color: C.text }}>{t("ui_del.pos.cod")}</Typography>}
      />
    </Box>
  );
}
