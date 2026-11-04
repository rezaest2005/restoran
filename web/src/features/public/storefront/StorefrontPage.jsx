import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import StorefrontRenderer from "./StorefrontRenderer";

/**
 * Public page. `/s/:slug` loads the published payload; when rendered at the
 * site root (custom domain) it asks the server which storefront the Host maps to.
 */
export default function StorefrontPage({ byHost = false }) {
  const { slug } = useParams();
  const { t } = useTranslation();
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    const url = byHost ? "/api/storefront/by-host/" : `/api/storefront/${encodeURIComponent(slug)}/`;
    const ctl = new AbortController();
    fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setState({ status: "ok", data });
        document.title = data.name || "";
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setState({ status: "notfound", data: null });
      });
    return () => ctl.abort();
  }, [slug, byHost]);

  if (state.status === "notfound") {
    return byHost ? <Navigate to="/dashboard" replace /> : (
      <div style={{ padding: 40, textAlign: "center" }}>{t("ui_k.public.not_found")}</div>
    );
  }
  if (state.status === "loading") return null;
  return <StorefrontRenderer data={state.data} />;
}
