import { Box, TextField } from "@mui/material";
import { PersonAdd, Phone } from "@mui/icons-material";

export default function CustomerInfo({
  custName,
  setCustName,
  custPhone,
  setCustPhone,
  requireCustomer,
  C,
  isRtl,
}) {
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      fontFamily: "'Vazirmatn', sans-serif",
      bgcolor: C.inputBg,
      fontSize: 13,
      "& fieldset": { borderColor: C.glassBorder, borderWidth: 1 },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    },
    "& .MuiInputLabel-root": {
      fontFamily: "'Vazirmatn', sans-serif",
      fontSize: 12,
      color: C.sub,
      "&.Mui-focused": { color: C.olive },
    },
  };

  return (
    <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
      <TextField
        fullWidth
        size="small"
        label={isRtl ? "نام مشتری" : "Customer name"}
        value={custName}
        onChange={(e) => setCustName(e.target.value)}
        required={requireCustomer}
        sx={inputSx}
        slotProps={{
          input: {
            startAdornment: (
              <PersonAdd sx={{ color: C.muted, fontSize: 16, mr: 0.5 }} />
            ),
          },
        }}
      />
      <TextField
        fullWidth
        size="small"
        label={isRtl ? "تلفن" : "Phone"}
        value={custPhone}
        onChange={(e) => setCustPhone(e.target.value)}
        sx={inputSx}
        slotProps={{
          input: {
            startAdornment: (
              <Phone sx={{ color: C.muted, fontSize: 16, mr: 0.5 }} />
            ),
          },
        }}
      />
    </Box>
  );
}
