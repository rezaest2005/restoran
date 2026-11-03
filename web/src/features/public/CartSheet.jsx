import { Drawer, Box, Typography, IconButton, TextField, Button, Alert, CircularProgress } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { formatPrice } from "./ProductCard";

export default function CartSheet({
  open, onClose, C, lines, total, getName,
  onAdd, onRemove, onDelete,
  needTable, tableValue, onTableChange, tableError,
  name, onName, phone, onPhone, note, onNote,
  submitting, error, onSubmit,
}) {
  const { t } = useTranslation();

  const fieldSx = {
    "& .MuiOutlinedInput-root": { background: C.inputBg, borderRadius: 2, color: C.text },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder },
    "& .MuiInputLabel-root": { color: C.sub },
    "& .MuiFormHelperText-root": { color: C.sub },
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          background: C.bg, backgroundImage: "none", color: C.text,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: "92vh", maxWidth: 640, mx: "auto", width: "100%",
        },
      }}
    >
      <Box sx={{ px: 2, py: 2, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{t("ui_d.qr.cart_title")}</Typography>
          <IconButton aria-label={t("ui_d.qr.close")} onClick={onClose} sx={{ width: 40, height: 40, color: C.sub }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {lines.length === 0 ? (
          <Typography sx={{ color: C.sub, textAlign: "center", py: 3 }}>{t("ui_d.qr.cart_empty")}</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {lines.map(({ item, qty }) => {
              const nm = getName(item);
              return (
                <Box key={item.id} sx={{
                  display: "flex", alignItems: "center", gap: 0.5, p: 1, borderRadius: 2,
                  background: C.glass, border: `1px solid ${C.glassBorder}`,
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14, wordBreak: "break-word" }}>{nm}</Typography>
                    <Typography sx={{ color: C.sub, fontSize: 12 }}>
                      {formatPrice(item.final_price * qty)} {t("ui_d.qr.currency")}
                    </Typography>
                  </Box>
                  <IconButton aria-label={t("ui_d.qr.dec_aria", { name: nm })} onClick={() => onRemove(item.id)}
                    sx={{ width: 40, height: 40, color: C.primary }}><RemoveIcon fontSize="small" /></IconButton>
                  <Typography sx={{ minWidth: 20, textAlign: "center", fontWeight: 700 }}>{qty}</Typography>
                  <IconButton aria-label={t("ui_d.qr.inc_aria", { name: nm })} onClick={() => onAdd(item.id)}
                    sx={{ width: 40, height: 40, color: C.primary }}><AddIcon fontSize="small" /></IconButton>
                  <IconButton aria-label={t("ui_d.qr.remove_aria", { name: nm })} onClick={() => onDelete(item.id)}
                    sx={{ width: 40, height: 40, color: C.danger }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              );
            })}
          </Box>
        )}

        {needTable && (
          <TextField
            label={t("ui_d.qr.table_label")} value={tableValue} required size="small" sx={fieldSx}
            onChange={(e) => onTableChange(e.target.value)}
            inputProps={{ maxLength: 20 }}
            error={!!tableError} helperText={tableError ? t("ui_d.qr.table_invalid") : " "}
          />
        )}
        <TextField label={t("ui_d.qr.name_label")} value={name} size="small" sx={fieldSx}
          onChange={(e) => onName(e.target.value)} inputProps={{ maxLength: 100 }} />
        <TextField label={t("ui_d.qr.phone_label")} value={phone} size="small" sx={fieldSx}
          onChange={(e) => onPhone(e.target.value)} inputProps={{ maxLength: 20, inputMode: "tel" }} />
        <TextField label={t("ui_d.qr.note_label")} value={note} size="small" sx={fieldSx} multiline minRows={2}
          onChange={(e) => onNote(e.target.value)} inputProps={{ maxLength: 300 }}
          helperText={`${note.length}/300`} />

        {error && <Alert severity="error">{error}</Alert>}

        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_d.qr.estimated_total")}</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: 18, color: C.primary }}>
              {formatPrice(total)} {t("ui_d.qr.currency")}
            </Typography>
          </Box>
          <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_d.qr.price_note")}</Typography>
        </Box>

        <Button
          onClick={onSubmit}
          disabled={submitting || lines.length === 0}
          sx={{
            minHeight: 48, borderRadius: 2.5, fontWeight: 800, fontSize: 15,
            background: C.btnGrad, color: C.onPrimary,
            "&:hover": { background: C.btnHover },
            "&.Mui-disabled": { opacity: 0.5, color: C.onPrimary },
          }}
        >
          {submitting ? (<><CircularProgress size={18} sx={{ color: C.onPrimary, mx: 1 }} />{t("ui_d.qr.submitting")}</>) : t("ui_d.qr.submit")}
        </Button>
      </Box>
    </Drawer>
  );
}
