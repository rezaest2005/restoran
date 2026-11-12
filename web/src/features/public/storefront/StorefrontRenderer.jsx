import { useEffect, useMemo, useState } from "react";
import { withBase } from "@shared/basePath";
import i18n from "i18next";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";

/**
 * Renders a storefront strictly from JSON (theme + sections).
 * No HTML from the data is ever injected: everything is a React text node
 * and links are validated again here.
 */

const FONT_STACK = {
  Vazirmatn: "Vazirmatn, system-ui, sans-serif",
  "Plus Jakarta Sans": "'Plus Jakarta Sans', system-ui, sans-serif",
  Inter: "Inter, system-ui, sans-serif",
  Roboto: "Roboto, system-ui, sans-serif",
  "Noto Sans": "'Noto Sans', system-ui, sans-serif",
  Lora: "Lora, Georgia, serif",
};
const SPACING = { compact: 28, comfortable: 48, spacious: 72 };
const SAFE_LINK = /^(https?:\/\/|\/(?!\/)|tel:|mailto:|#)/i;

export const safeHref = (u) => (typeof u === "string" && SAFE_LINK.test(u) ? u : undefined);

export function themeVars(theme = {}) {
  return {
    "--sf-primary": theme.primary || "#2563eb",
    "--sf-accent": theme.accent || "#f59e0b",
    "--sf-bg": theme.background || "#ffffff",
    "--sf-surface": theme.surface || "#f3f4f6",
    "--sf-text": theme.text || "#111827",
    "--sf-muted": theme.muted || "#4b5563",
    "--sf-radius": `${Number.isInteger(theme.radius) ? theme.radius : 12}px`,
    "--sf-space": `${SPACING[theme.density] || SPACING.comfortable}px`,
    fontFamily: FONT_STACK[theme.font_family] || FONT_STACK.Vazirmatn,
  };
}

const CSS = `
.sf-root{background:var(--sf-bg);color:var(--sf-text);min-height:100%;line-height:1.7;overflow-x:hidden;font-size:16px}
.sf-root *{box-sizing:border-box}
.sf-wrap{max-width:1100px;margin:0 auto;padding:0 16px}
.sf-sec{padding:var(--sf-space) 0}
.sf-h2{font-size:clamp(1.4rem,4vw,2rem);font-weight:800;margin:0 0 12px}
.sf-muted{color:var(--sf-muted)}
.sf-btn{display:inline-block;padding:12px 26px;border-radius:calc(var(--sf-radius) * 2);background:var(--sf-primary);color:var(--sf-bg);font-weight:700;text-decoration:none;border:2px solid var(--sf-primary);cursor:pointer;font:inherit;font-weight:700}
.sf-btn.alt{background:transparent;color:var(--sf-text);border-color:var(--sf-muted)}
.sf-btn:focus-visible,.sf-root a:focus-visible,.sf-root input:focus-visible{outline:3px solid var(--sf-accent);outline-offset:2px}
.sf-card{background:var(--sf-surface);border-radius:var(--sf-radius);padding:16px}
.sf-hero{display:grid;grid-template-columns:1fr;gap:24px;align-items:center}
.sf-hero h1{font-size:clamp(1.8rem,6vw,3.2rem);line-height:1.2;margin:0 0 12px}
.sf-badge{display:inline-block;background:var(--sf-surface);color:var(--sf-accent);padding:4px 14px;border-radius:99px;font-size:.85rem;font-weight:700;margin-bottom:14px}
.sf-img{width:100%;height:auto;border-radius:var(--sf-radius);display:block;object-fit:cover}
.sf-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}
.sf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.sf-chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.sf-chip{border:1px solid var(--sf-muted);background:transparent;color:var(--sf-text);padding:6px 14px;border-radius:99px;cursor:pointer;font:inherit}
.sf-chip[aria-pressed=true]{background:var(--sf-primary);color:var(--sf-bg);border-color:var(--sf-primary)}
.sf-price{color:var(--sf-accent);font-weight:700}
.sf-old{text-decoration:line-through;color:var(--sf-muted);font-size:.85rem;margin-inline-start:6px}
.sf-hours{width:100%;max-width:420px;border-collapse:collapse}
.sf-hours td{padding:6px 0;border-bottom:1px solid var(--sf-surface)}
.sf-field{display:block;width:100%;padding:10px 12px;margin-bottom:10px;border-radius:var(--sf-radius);border:1px solid var(--sf-muted);background:var(--sf-bg);color:var(--sf-text);font:inherit}
.sf-hp{position:absolute;inset-inline-start:-9999px;width:1px;height:1px;opacity:0}
.sf-foot{border-top:1px solid var(--sf-surface);padding:28px 0;text-align:center}
.sf-foot a{margin:0 10px;color:var(--sf-muted)}
@media(min-width:760px){.sf-hero.has-img{grid-template-columns:1.2fr 1fr}}
`;

const Link = ({ href, className = "sf-btn", children }) => {
  const h = safeHref(href);
  if (!h) return null;
  const external = /^https?:/i.test(h);
  return (
    <a className={className} href={h} {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
      {children}
    </a>
  );
};

const Img = ({ src, alt = "", ...rest }) =>
  src ? <img className="sf-img" src={src} alt={alt} loading="lazy" decoding="async" {...rest} /> : null;

function Hero({ d }) {
  return (
    <section className="sf-sec"><div className="sf-wrap">
      <div className={`sf-hero${d.image ? " has-img" : ""}`}>
        <div>
          {d.badge && <span className="sf-badge">{d.badge}</span>}
          <h1>{d.title}</h1>
          {d.subtitle && <p className="sf-muted">{d.subtitle}</p>}
          <div className="sf-row">
            {d.primary_label && <Link href={d.primary_url}>{d.primary_label}</Link>}
            {d.secondary_label && <Link href={d.secondary_url} className="sf-btn alt">{d.secondary_label}</Link>}
          </div>
        </div>
        <Img src={d.image} />
      </div>
    </div></section>
  );
}

const About = ({ d }) => (
  <section className="sf-sec"><div className="sf-wrap">
    <div className={`sf-hero${d.image ? " has-img" : ""}`}>
      <div>
        {d.title && <h2 className="sf-h2">{d.title}</h2>}
        {d.body && <p className="sf-muted" style={{ whiteSpace: "pre-line" }}>{d.body}</p>}
      </div>
      <Img src={d.image} />
    </div>
  </div></section>
);

const TextBlock = ({ d }) => (
  <section className="sf-sec"><div className="sf-wrap">
    {d.title && <h2 className="sf-h2">{d.title}</h2>}
    {d.body && <p style={{ whiteSpace: "pre-line" }}>{d.body}</p>}
  </div></section>
);

const Cta = ({ d }) => (
  <section className="sf-sec"><div className="sf-wrap">
    <div className="sf-card" style={{ textAlign: "center", padding: "36px 16px" }}>
      {d.title && <h2 className="sf-h2">{d.title}</h2>}
      {d.body && <p className="sf-muted">{d.body}</p>}
      {d.button_label && <Link href={d.button_url}>{d.button_label}</Link>}
    </div>
  </div></section>
);

function Gallery({ d }) {
  const images = d.images || [];
  return (
    <section className="sf-sec"><div className="sf-wrap">
      {d.title && <h2 className="sf-h2">{d.title}</h2>}
      <div className="sf-grid">
        {images.map((im, i) => <Img key={i} src={im.url} alt={im.alt || ""} style={{ aspectRatio: "1/1" }} />)}
      </div>
    </div></section>
  );
}

function Hours({ d, tr }) {
  const names = tr("ui_k.weekday", { returnObjects: true });
  const days = [...(d.days || [])].sort((a, b) => a.day - b.day);
  return (
    <section className="sf-sec"><div className="sf-wrap">
      {d.title && <h2 className="sf-h2">{d.title}</h2>}
      <table className="sf-hours"><tbody>
        {days.map((x) => (
          <tr key={x.day}>
            <td>{Array.isArray(names) ? names[x.day] : x.day}</td>
            <td dir="ltr" style={{ textAlign: "end" }}>
              {x.closed ? tr("ui_k.public.closed") : `${x.open || ""} - ${x.close || ""}`}
            </td>
          </tr>
        ))}
      </tbody></table>
      {d.note && <p className="sf-muted">{d.note}</p>}
    </div></section>
  );
}

function Contact({ d, tr }) {
  const hasMap = Number.isFinite(d.lat) && Number.isFinite(d.lng);
  return (
    <section className="sf-sec" id="contact"><div className="sf-wrap">
      {d.title && <h2 className="sf-h2">{d.title}</h2>}
      {d.phone && <p><a href={`tel:${d.phone.replace(/[^+\d]/g, "")}`} dir="ltr">{d.phone}</a></p>}
      {d.address && <p className="sf-muted" style={{ whiteSpace: "pre-line" }}>{d.address}</p>}
      {hasMap && (
        <Link className="sf-btn alt" href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=17/${d.lat}/${d.lng}`}>
          {tr("ui_k.public.map")}
        </Link>
      )}
    </div></section>
  );
}

function Footer({ d, data, tr, preview }) {
  return (
    <footer className="sf-foot"><div className="sf-wrap">
      <p>
        {(d.links || []).map((l, i) => <Link key={i} href={l.url} className="">{l.label}</Link>)}
      </p>
      {d.copyright && <p className="sf-muted">{d.copyright}</p>}
      {data.slug && !preview && (
        <p><a href={withBase(`/f/${encodeURIComponent(data.slug)}`)} className="">{tr("ui_fb.pub.link")}</a></p>
      )}
      {data.dashboard_url && (
        <Link href={data.dashboard_url} className="sf-btn alt">{tr("ui_k.public.dashboard")}</Link>
      )}
    </div></footer>
  );
}

const fmt = (n, lang) => Number(n || 0).toLocaleString(lang === "en" ? "en-US" : "fa-IR");

function Menu({ d, data, tr, lang, preview }) {
  const [items, setItems] = useState(null);
  const [cat, setCat] = useState("all");
  const slug = data.menu_slug;
  useEffect(() => {
    if (!slug) return undefined;
    const ctl = new AbortController();
    const size = Math.min(60, Math.max(1, d.max_items || 24));
    fetch(`/api/menu/public/?business_slug=${encodeURIComponent(slug)}&page_size=${size}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((j) => setItems(j.results || []))
      .catch(() => setItems([]));
    return () => ctl.abort();
  }, [slug, d.max_items]);

  const cats = useMemo(() => {
    const m = new Map();
    (items || []).forEach((i) => i.category_id && m.set(i.category_id, i.category_name));
    return [...m.entries()];
  }, [items]);
  const shown = (items || []).filter((i) => cat === "all" || String(i.category_id) === String(cat));
  const orderHref = slug ? `/m/${slug}` : undefined;

  return (
    <section className="sf-sec" id="catalog"><div className="sf-wrap">
      {d.title && <h2 className="sf-h2">{d.title}</h2>}
      {d.subtitle && <p className="sf-muted">{d.subtitle}</p>}
      {d.show_categories && cats.length > 1 && (
        <div className="sf-chips" role="group">
          <button className="sf-chip" aria-pressed={cat === "all"} onClick={() => setCat("all")}>{tr("ui_k.public.all")}</button>
          {cats.map(([id, name]) => (
            <button key={id} className="sf-chip" aria-pressed={String(cat) === String(id)} onClick={() => setCat(id)}>{name}</button>
          ))}
        </div>
      )}
      {items === null && <p className="sf-muted">{tr("ui_k.public.menu_loading")}</p>}
      {items && shown.length === 0 && <p className="sf-muted">{tr("ui_k.public.menu_empty")}</p>}
      <div className="sf-grid">
        {shown.map((i) => (
          <div className="sf-card" key={i.id}>
            <Img src={i.image} alt={i.name} style={{ aspectRatio: "4/3", marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>{lang === "en" && i.name_en ? i.name_en : i.name}</div>
            {d.show_prices && (
              <div>
                <span className="sf-price">{fmt(i.final_price, lang)} {tr("ui_k.public.currency")}</span>
                {i.final_price < i.price && <span className="sf-old">{fmt(i.price, lang)}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      {d.order_enabled && orderHref && !preview && (
        <div className="sf-row"><Link href={orderHref}>{tr("ui_k.public.order")}</Link></div>
      )}
    </div></section>
  );
}

function ClubJoin({ data, tr }) {
  const [state, setState] = useState("idle");
  const [form, setForm] = useState({ name: "", phone: "", website: "" });
  const submit = async (e) => {
    e.preventDefault();
    setState("busy");
    try {
      const r = await fetch(`/api/storefront/${encodeURIComponent(data.slug)}/club/join/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };
  return (
    <section className="sf-sec"><div className="sf-wrap" style={{ maxWidth: 420 }}>
      <h2 className="sf-h2">{tr("ui_k.public.join_title")}</h2>
      {state === "done" ? <p>{tr("ui_k.public.join_done")}</p> : (
        <form onSubmit={submit}>
          <input className="sf-field" required maxLength={200} placeholder={tr("ui_k.public.join_name")}
            aria-label={tr("ui_k.public.join_name")} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="sf-field" required inputMode="tel" dir="ltr" maxLength={20} placeholder={tr("ui_k.public.join_phone")}
            aria-label={tr("ui_k.public.join_phone")} value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="sf-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website"
            value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <button className="sf-btn" type="submit" disabled={state === "busy"}>{tr("ui_k.public.join_submit")}</button>
          {state === "error" && <p role="alert" className="sf-muted">{tr("ui_k.public.join_error")}</p>}
        </form>
      )}
    </div></section>
  );
}

const BLOCKS = {
  hero: Hero, about: About, text: TextBlock, cta: Cta, gallery: Gallery,
  hours: Hours, contact: Contact, menu: Menu,
};

export default function StorefrontRenderer({ data, preview = false }) {
  const lang = data.content_language === "en" ? "en" : "fa";
  const tr = useMemo(() => i18n.getFixedT(lang), [lang]);
  const sections = data.sections || [];
  const footer = sections.find((s) => s.type === "footer");
  const body = sections.filter((s) => s.type !== "footer" && s.visible !== false);
  const vars = useMemo(() => themeVars(data.theme), [data.theme]);

  // Alt+B -> dashboard, only for a signed-in visitor (staff) and never inside the editor preview
  const loggedIn = (() => {
    try { return !!(sessionStorage.getItem("access_token") || localStorage.getItem("access_token")); } catch { return false; }
  })();
  const dashHref = safeHref(data.dashboard_url);
  useRegisteredShortcuts([
    { combo: "Alt+B", label: tr("ui_l.public.go_dashboard"), handler: () => window.location.assign(dashHref) },
  ], { enabled: !preview && loggedIn && !!dashHref });

  return (
    <div className="sf-root" dir={lang === "en" ? "ltr" : "rtl"} lang={lang} style={vars}>
      <style>{CSS}</style>
      {body.map((s) => {
        const Block = BLOCKS[s.type];
        return Block ? <Block key={s.id} d={s.data || {}} data={data} tr={tr} lang={lang} preview={preview} /> : null;
      })}
      {data.club_join && !preview && <ClubJoin data={data} tr={tr} />}
      {(footer || data.dashboard_url) && (
        <Footer d={footer?.data || {}} data={data} tr={tr} preview={preview} />
      )}
    </div>
  );
}
