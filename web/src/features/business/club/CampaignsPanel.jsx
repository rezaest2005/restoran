import { useCallback, useEffect, useState } from "react";
import {
  Box, Button, Chip, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import { TableWrap, fmtDate } from "../accounting/common";
import { fetchMessages, runCampaign, errMsg } from "./api";
import CrudSection from "./CrudSection";

const KINDS = ["birthday", "anniversary", "inactivity", "segment"];
const SEGMENTS = ["new", "loyal", "regular", "at_risk", "lost"];

/** Rule-based campaigns (run daily by the job worker, or now) and the message outbox. */
export default function CampaignsPanel({ ctx }) {
  const { t, C, S, lang, notify } = ctx;
  const [msgs, setMsgs] = useState(null);
  const loadMsgs = useCallback(() => {
    fetchMessages().then((d) => setMsgs(Array.isArray(d) ? d : [])).catch(() => setMsgs([]));
  }, []);
  useEffect(() => { loadMsgs(); }, [loadMsgs]);

  const run = async (row, reload) => {
    try {
      const r = await runCampaign(row.id);
      notify(t("ui_club2.camp.ran", { n: r.data?.reached ?? 0 }));
      reload();
      loadMsgs();
    } catch (e) {
      notify(errMsg(e, t("ui_club.err.generic")), "error");
    }
  };

  const fields = [
    { key: "name", type: "text", label: "ui_club2.camp.name" },
    { key: "kind", type: "select", label: "ui_club2.camp.kind",
      options: KINDS.map((k) => ({ value: k, labelKey: `ui_club2.camp.k_${k}` })) },
    { key: "segment", type: "select", label: "ui_club2.camp.segment", when: (f) => f.kind === "segment",
      options: SEGMENTS.map((s) => ({ value: s, labelKey: `ui_club2.seg.${s}` })) },
    { key: "inactivity_days", type: "number", label: "ui_club2.camp.inactivity_days", when: (f) => f.kind === "inactivity" },
    { key: "bonus_points", type: "number", label: "ui_club2.camp.bonus_points" },
    { key: "coupon_kind", type: "select", label: "ui_club2.camp.coupon_kind",
      options: [{ value: "", labelKey: "ui_club2.camp.no_coupon" },
        ...["amount", "percent", "free_item"].map((k) => ({ value: k, labelKey: `ui_club2.kind.${k}` }))] },
    { key: "coupon_value", type: "number", label: "ui_club2.coupon.value", when: (f) => !!f.coupon_kind },
    { key: "coupon_valid_days", type: "number", label: "ui_club2.reward.valid_days", when: (f) => !!f.coupon_kind },
    { key: "message", type: "multiline", label: "ui_club2.camp.message", hint: "ui_club2.camp.message_hint" },
    { key: "is_active", type: "bool", label: "ui_club2.active" },
  ];

  const statusColor = (s) => ({ sent: C.success, failed: C.danger, queued: C.info }[s] || C.muted);

  return (
    <>
      <CrudSection ctx={ctx} kind="campaigns" title={t("ui_club2.camp.title")} hint={t("ui_club2.camp.hint")}
        fields={fields}
        defaults={{ kind: "birthday", inactivity_days: 60, bonus_points: 0, coupon_kind: "", coupon_valid_days: 14,
          is_active: true, segment: "at_risk" }}
        columns={[
          { label: t("ui_club2.camp.name"), render: (r) => r.name },
          { label: t("ui_club2.camp.kind"), render: (r) => t(`ui_club2.camp.k_${r.kind}`)
            + (r.kind === "segment" && r.segment ? ` — ${t(`ui_club2.seg.${r.segment}`)}` : "") },
          { label: t("ui_club2.camp.reached"), num: true, render: (r) => r.reached },
          { label: t("ui_club2.camp.last_run"), render: (r) => (r.last_run_at ? fmtDate(r.last_run_at, lang) : "—") },
        ]}
        actions={(r, reload) => (
          <Button size="small" sx={S.link} onClick={() => run(r, reload)}>{t("ui_club2.camp.run")}</Button>
        )} />

      <Box sx={S.card}>
        <Typography sx={{ color: C.text, fontWeight: 800, mb: 0.5 }}>{t("ui_club2.msg.title")}</Typography>
        <Typography sx={{ color: C.muted, fontSize: 12, mb: 1 }}>{t("ui_club2.msg.hint")}</Typography>
        {msgs == null ? <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={24} /></Box>
          : msgs.length === 0 ? <Typography sx={{ color: C.muted, textAlign: "center", py: 2 }}>{t("ui_club2.none")}</Typography>
            : (
              <TableWrap C={C}>
                <Table size="small" sx={{ minWidth: 560 }}>
                  <TableHead><TableRow>
                    <TableCell sx={S.th}>{t("ui_club.history.date")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_club.member.name")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_club2.msg.body")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_club2.msg.status")}</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {msgs.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell sx={S.td}>{fmtDate(m.created_at, lang)}</TableCell>
                        <TableCell sx={S.td}>{m.member_name || <span dir="ltr">{m.phone}</span>}</TableCell>
                        <TableCell sx={{ ...S.td, maxWidth: 320 }}>{m.body}</TableCell>
                        <TableCell sx={S.td}>
                          <Chip size="small" label={t(`ui_club2.msg.s_${m.status}`)}
                            sx={{ color: statusColor(m.status), border: `1px solid ${statusColor(m.status)}`, bgcolor: "transparent" }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            )}
      </Box>
    </>
  );
}
