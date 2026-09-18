import { Box, TextField, InputAdornment, Button } from "@mui/material";
import { Search, Edit, Close } from "@mui/icons-material";

export default function PosHeader({
  search, setSearch, C, useDictionary, isRtl,
  editMode, setEditMode,
}) {
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
        placeholder={isRtl ? "جستجو..." : "Search..."}
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: "10px", bgcolor: C.inputBg, fontSize: 13,
            width: 200, height: 36, fontFamily: "'Vazirmatn', sans-serif",
            "& fieldset": { borderColor: C.glassBorder },
            "&:hover fieldset": { borderColor: C.olive },
            "&.Mui-focused fieldset": { borderColor: C.olive },
          },
        }}
        slotProps={{
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