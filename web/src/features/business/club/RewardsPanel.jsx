import { useEffect, useState } from "react";
import { fmtInt, fmtDate } from "../accounting/common";
import { crud } from "./api";
import CrudSection from "./CrudSection";

const KIND_OPTS = (kinds) => kinds.map((k) => ({ value: k, labelKey: `ui_club2.kind.${k}` }));

/** Rewards catalogue (points → personal coupon) and discount codes with usage limits. */
export default function RewardsPanel({ ctx }) {
  const { t, lang } = ctx;
  const [tiers, setTiers] = useState([]);
  useEffect(() => { crud("tiers").list().then((d) => setTiers(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const valueText = (r) => (r.kind === "percent" ? `${r.value}%` : fmtInt(r.value, lang));

  const rewardFields = [
    { key: "name", type: "text", label: "ui_club2.reward.name" },
    { key: "description", type: "text", label: "ui_club2.reward.description" },
    { key: "points_cost", type: "number", label: "ui_club2.reward.points_cost" },
    { key: "kind", type: "select", label: "ui_club2.reward.kind",
      options: KIND_OPTS(["amount", "percent", "free_item", "gift"]) },
    { key: "value", type: "number", label: "ui_club2.reward.value", hint: "ui_club2.reward.value_hint" },
    { key: "max_discount", type: "number", label: "ui_club2.coupon.max_discount", when: (f) => f.kind === "percent" },
    { key: "stock", type: "number", label: "ui_club2.reward.stock", hint: "ui_club2.blank_unlimited" },
    { key: "min_tier_id", type: "select", label: "ui_club2.reward.min_tier",
      options: [{ value: "", labelKey: "ui_club2.any_tier" }, ...tiers.map((x) => ({ value: x.id, label: x.name }))] },
    { key: "valid_days", type: "number", label: "ui_club2.reward.valid_days" },
    { key: "is_active", type: "bool", label: "ui_club2.active" },
  ];

  const couponFields = [
    { key: "code", type: "text", label: "ui_club2.coupon.code", hint: "ui_club2.coupon.code_hint", createOnly: true, ltr: true },
    { key: "title", type: "text", label: "ui_club2.coupon.title" },
    { key: "kind", type: "select", label: "ui_club2.coupon.kind", options: KIND_OPTS(["amount", "percent", "free_item"]) },
    { key: "value", type: "number", label: "ui_club2.coupon.value" },
    { key: "max_discount", type: "number", label: "ui_club2.coupon.max_discount", when: (f) => f.kind === "percent" },
    { key: "min_purchase", type: "number", label: "ui_club2.coupon.min_purchase" },
    { key: "usage_limit", type: "number", label: "ui_club2.coupon.usage_limit", hint: "ui_club2.blank_unlimited" },
    { key: "per_member_limit", type: "number", label: "ui_club2.coupon.per_member_limit", hint: "ui_club2.blank_unlimited" },
    { key: "members_only", type: "bool", label: "ui_club2.coupon.members_only" },
    { key: "starts_at", type: "datetime", label: "ui_club2.coupon.starts_at" },
    { key: "ends_at", type: "datetime", label: "ui_club2.coupon.ends_at" },
    { key: "is_active", type: "bool", label: "ui_club2.active" },
  ];

  return (
    <>
      <CrudSection ctx={ctx} kind="rewards" title={t("ui_club2.reward.title")} hint={t("ui_club2.reward.hint")}
        fields={rewardFields} defaults={{ kind: "amount", valid_days: 30, is_active: true, min_tier_id: "" }}
        columns={[
          { label: t("ui_club2.reward.name"), render: (r) => r.name },
          { label: t("ui_club2.reward.points_cost"), num: true, render: (r) => fmtInt(r.points_cost, lang) },
          { label: t("ui_club2.reward.kind"), render: (r) => `${t(`ui_club2.kind.${r.kind}`)} ${r.value ? valueText(r) : ""}` },
          { label: t("ui_club2.reward.stock"), num: true, render: (r) => (r.stock == null ? "∞" : fmtInt(r.stock, lang)) },
        ]} />
      <CrudSection ctx={ctx} kind="coupons" title={t("ui_club2.coupon.title_list")} hint={t("ui_club2.coupon.hint")}
        fields={couponFields} defaults={{ kind: "amount", is_active: true, min_purchase: 0 }}
        columns={[
          { label: t("ui_club2.coupon.code"), render: (r) => <span dir="ltr" style={{ fontWeight: 700 }}>{r.code}</span> },
          { label: t("ui_club2.coupon.value"), render: (r) => `${t(`ui_club2.kind.${r.kind}`)} ${valueText(r)}` },
          { label: t("ui_club2.coupon.used"), num: true,
            render: (r) => `${fmtInt(r.used_count, lang)} / ${r.usage_limit == null ? "∞" : fmtInt(r.usage_limit, lang)}` },
          { label: t("ui_club2.coupon.ends_at"), render: (r) => (r.ends_at ? fmtDate(r.ends_at, lang) : "—") },
        ]} />
    </>
  );
}
