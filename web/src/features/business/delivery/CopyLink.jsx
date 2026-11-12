import { useState } from "react";
import { Button } from "@mui/material";

/** Copies a tracking link to the clipboard (falls back to a prompt where the Clipboard API is blocked). */
export default function CopyLink({ url, label, doneLabel, size = "small", sx }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e?.stopPropagation?.();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(label, url);
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <Button size={size} variant="outlined" onClick={copy} sx={sx}>
      {done ? doneLabel : label}
    </Button>
  );
}
