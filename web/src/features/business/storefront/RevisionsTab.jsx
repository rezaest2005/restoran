import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { fetchRevisions, restoreRevision, errMsg } from "./api";

export default function RevisionsTab({ reloadKey, onRestored, onToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetchRevisions().then(setRows).catch((e) => setErr(errMsg(e, t("ui_k.error"))));
  }, [t]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [reloadKey]);

  const restore = async (id, publish) => {
    try {
      await restoreRevision(id, publish);
      onToast(t("ui_k.revisions.restored"), "success");
      onRestored();
    } catch (e) {
      onToast(errMsg(e, t("ui_k.error")), "error");
    }
  };

  if (err) return <Alert severity="error">{err}</Alert>;
  if (!rows) return <Typography>{t("ui_k.loading")}</Typography>;
  if (!rows.length) return <Typography color="text.secondary">{t("ui_k.revisions.empty")}</Typography>;
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
      {rows.map((r) => (
        <Box key={r.id} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 180 }}>
            <Typography dir="ltr" sx={{ textAlign: "start", fontWeight: 700 }}>
              {new Date(r.created_at).toLocaleString(document.documentElement.lang === "en" ? "en-GB" : "fa-IR")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("ui_k.revisions.sections_n", { count: r.sections })}
              {r.by ? ` · ${t("ui_k.revisions.by", { name: r.by })}` : ""}
            </Typography>
          </Box>
          <Button size="small" onClick={() => restore(r.id, false)}>{t("ui_k.revisions.restore")}</Button>
          <Button size="small" variant="outlined" onClick={() => restore(r.id, true)}>{t("ui_k.revisions.restore_publish")}</Button>
        </Box>
      ))}
    </Stack>
  );
}
