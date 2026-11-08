import { useTranslation } from "react-i18next";
import { Box, TextField, InputAdornment, Button } from "@mui/material";
import { Search, Edit, Close } from "@mui/icons-material";
import { KbdHint } from "../common";
import { looksLikeBarcode } from "../common/barcodeScanner";

export default function PosHeader({
  search, setSearch, onScanCode, C, useDictionary, isRtl,
  editMode, setEditMode,
}) {
  const { t } = useTranslation();
  if (!useDictionary) return null;

  return (
    <Box
      dir={isRtl ? "rtl" : "ltr"}
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 1,
        mb: 1.5,
      }}
    >
      <TextField
        size="small"
        placeholder={t("ui_pos2.scan.placeholder")}
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: "10px", bgcolor: C.inputBg, fontSize: 13,
            width: { xs: 170, sm: 260 }, height: 36, fontFamily: "'Vazirmatn', sans-serif",
            "& fieldset": { borderColor: C.glassBorder },
            "&:hover fieldset": { borderColor: C.olive },
            "&.Mui-focused fieldset": { borderColor: C.olive },
          },
        }}
        slotProps={{
          htmlInput: {
            id: "pos-search-input",
            "data-pos-search": "1",
            // A code typed (or scanned) in the search box + Enter is a barcode lookup.
            onKeyDown: (e) => {
              if (e.key === "Enter" && onScanCode && looksLikeBarcode(e.target.value)) {
                e.preventDefault();
                e.stopPropagation();
                onScanCode(e.target.value);
              }
            },
          },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: C.muted, fontSize: 16 }} />
              </InputAdornment>
            ),
          },
        }}
      />
      <Button
        onClick={() => setEditMode(!editMode)}
        size="small"
        sx={{
          minWidth: 0, px: 1.5, py: 0.6,
          borderRadius: "10px", fontSize: 12, fontWeight: 700,
          fontFamily: "'Vazirmatn', sans-serif",
          bgcolor: editMode ? C.dangerBg : C.oliveSubtle,
          color: editMode ? C.danger : C.olive,
          border: `1px solid ${editMode ? C.danger + "33" : C.glassBorder}`,
          "&:hover": { bgcolor: editMode ? C.dangerBg : C.oliveSubtle },
        }}
        startIcon={editMode ? <Close sx={{ fontSize: 14 }} /> : <Edit sx={{ fontSize: 14 }} />}
      >
        {editMode ? (isRtl ? "لغو" : "Cancel") : (isRtl ? "ویرایش" : "Edit")}
       
      </Button>
    </Box>
  );
}