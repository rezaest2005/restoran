import { Autocomplete, Box, TextField } from "@mui/material";
import { useSync, useLocalList } from "@shared/sync";
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
  const sync = useSync();
  const customers = useLocalList("customer");
  const useLocal = !!sync.active && customers.rows.length > 0;
  const nameInput = (params) => (
    <TextField
      {...params}
      fullWidth
      size="small"
      label={isRtl ? "نام مشتری" : "Customer name"}
      required={requireCustomer}
      sx={inputSx}
      slotProps={{
        ...params.slotProps,
        input: {
          ...params.slotProps?.input,
          startAdornment: (<><PersonAdd sx={{ color: C.muted, fontSize: 16, mr: 0.5 }} />{params.slotProps?.input?.startAdornment}</>),
        },
      }}
    />
  );
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
      {useLocal ? (
        <Autocomplete
          freeSolo fullWidth size="small" data-testid="customer-autocomplete"
          options={customers.rows.filter((c) => c.is_active !== false)}
          getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
          filterOptions={(opts, { inputValue }) => {
            const q = inputValue.trim().toLowerCase();
            if (!q) return [];
            return opts.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)).slice(0, 8);
          }}
          inputValue={custName}
          onInputChange={(_e, v, reason) => { if (reason !== "reset") setCustName(v); }}
          onChange={(_e, v) => { if (v && typeof v === "object") { setCustName(v.name); if (v.phone) setCustPhone(v.phone); } }}
          renderInput={nameInput}
        />
      ) : (
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
      )}
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
