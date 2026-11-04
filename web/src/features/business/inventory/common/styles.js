// Shared `sx` builders. Colors always come from the palette object `C`.

export const buildInputSx = (C) => ({
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px", bgcolor: C.inputBg, backdropFilter: "blur(8px)",
    fontSize: 13, fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", color: C.text,
    transition: "all 0.25s ease",
    "& fieldset": { borderColor: C.glassBorder },
    "&:hover fieldset": { borderColor: C.olive + "60" },
    "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
    "&.Mui-focused": { boxShadow: `0 0 0 3px ${C.olive}18` },
  },
  "& .MuiInputLabel-root": { fontSize: 12, color: C.sub },
  "& .MuiInputBase-input": { color: C.text },
  "& .MuiInputBase-input::placeholder": { color: C.muted, opacity: 1 },
});

export const buildDialogPaperSx = (C, isDark) => ({
  borderRadius: "16px", bgcolor: isDark ? "#1A1A2E" : "#fff",
  border: `1px solid ${C.glassBorder}`,
});
