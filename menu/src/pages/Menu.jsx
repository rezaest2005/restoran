// src/pages/Menu.jsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

/* ═══════════════════════════════════════════════════════
 * تم رنگی: Midnight Luxury Glow
 * ═══════════════════════════════════════════════════════ */
const T = {
  bg:          '#0b0c10',
  bgDeep:      '#050608',
  surface:     'rgba(20, 22, 28, 0.65)',
  surface2:    '#1f232d',
  card:        'rgba(26, 29, 38, 0.55)',
  border:      'rgba(255, 255, 255, 0.05)',
  borderHov:   'rgba(255, 110, 40, 0.3)',
  accent:      '#ff6e28',
  accentHot:   '#ff4500',
  accentGlow:  'rgba(255, 110, 40, 0.25)',
  gold:        '#f1c40f',
  goldBright:  '#ffeaa7',
  green:       '#00b894',
  greenDark:   '#00dec5',
  text:        '#f5f6fa',
  textMuted:   '#a4b0be',
  textDim:     '#57606f',
  shadow:      'rgba(0,0,0,0.6)',
  r: '24px',
};

/* ═══════════════════════════════════════════════════════
 * Icons (SVG)
 * ═══════════════════════════════════════════════════════ */
const CartSVG = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
  </svg>
);
const SparklesSVG = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 5a7 7 0 100 14 7 7 0 000-14z"/>
  </svg>
);
const SearchSVG = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const ArrowSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const StarSVG = ({filled}) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? T.gold : 'none'} stroke={filled ? T.gold : 'currentColor'} strokeWidth="2">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);
const CheckSVG = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const FireSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>
  </svg>
);

function AmbientBackground() {
  return (
    <div className="ambient-container">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * Styles (CSS)
 * ═══════════════════════════════════════════════════════ */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap');

.mp * { margin: 0; padding: 0; box-sizing: border-box; }
.mp {
  font-family: 'Vazirmatn', sans-serif; direction: rtl; text-align: right;
  background: ${T.bg}; color: ${T.text}; min-height: 100vh; overflow-x: hidden; position: relative;
}

.ambient-container { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.blob { position: absolute; border-radius: 50%; filter: blur(140px); opacity: 0.12; mix-blend-mode: screen; }
.blob-1 { width: 500px; height: 500px; background: ${T.accent}; top: -10%; right: -5%; animation: drift 20s infinite alternate; }
.blob-2 { width: 400px; height: 400px; background: ${T.gold}; bottom: -10%; left: -5%; animation: drift 25s infinite alternate-reverse 2s; }
.blob-3 { width: 350px; height: 350px; background: ${T.accentHot}; top: 40%; left: 30%; animation: drift 18s infinite alternate 4s; }

@keyframes drift {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(60px, 40px) scale(1.15); }
}

.w { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; padding: 40px 24px 120px; }

/* ── Hero ── */
.hp {
  display: flex; align-items: center; justify-content: space-between;
  gap: 40px; padding: 60px 0 40px;
}
.hero-content { flex: 1.2; text-align: right; }
.hb {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(255, 110, 40, 0.06); border: 1px solid rgba(255, 110, 40, 0.2);
  backdrop-filter: blur(12px); color: ${T.accent};
  font-weight: 700; font-size: .85rem; padding: 8px 20px; border-radius: 100px; margin-bottom: 24px;
}
.hp h1 {
  font-size: clamp(2.6rem, 6vw, 4rem); font-weight: 900; line-height: 1.2;
  margin-bottom: 20px; color: ${T.text}; letter-spacing: -0.02em;
}
.hl {
  background: linear-gradient(135deg, #fff 20%, ${T.accent} 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.hs { color: ${T.textMuted}; font-size: 1.15rem; font-weight: 300; max-width: 580px; line-height: 1.8; }

/* ── Hero Visual ── */
.hero-visual {
  flex: 1; display: flex; justify-content: center; align-items: center;
  position: relative; min-height: 400px;
}
.hero-img-backdrop {
  position: absolute; width: 350px; height: 350px;
  background: radial-gradient(circle, rgba(255, 110, 40, 0.4) 0%, rgba(255, 69, 0, 0.05) 60%, transparent 100%);
  filter: blur(50px); z-index: -1; animation: pulseGlow 4s ease-in-out infinite alternate;
}
.hero-food-plate {
  position: relative; width: 420px; height: 420px;
  display: flex; align-items: center; justify-content: center;
  animation: floatingFood 6s ease-in-out infinite;
  filter: drop-shadow(0 35px 50px rgba(0,0,0,0.7));
}
.hero-food-plate img { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
.hero-food-plate:hover img { transform: scale(1.04) rotate(3deg) !important; }

.hero-badge {
  position: absolute; bottom: 40px; right: -10px;
  background: rgba(26, 29, 38, 0.75); border: 1px solid rgba(255, 110, 40, 0.25);
  backdrop-filter: blur(20px); padding: 14px 22px; border-radius: 20px;
  display: flex; align-items: center; gap: 14px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.6);
  animation: floatingFood 6s ease-in-out infinite reverse 1s; z-index: 10;
}
.hero-badge-icon {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, ${T.accent}, ${T.accentHot});
  display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
  box-shadow: 0 8px 16px rgba(255, 110, 40, 0.3);
}
.hero-badge-text div:first-child { font-size: 0.78rem; color: ${T.textMuted}; font-weight: 500; }
.hero-badge-text div:last-child { font-size: 0.95rem; font-weight: 800; color: #fff; margin-top: 2px; }

@keyframes floatingFood {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(2deg); }
}
@keyframes pulseGlow {
  0% { transform: scale(0.85); opacity: 0.3; }
  100% { transform: scale(1.15); opacity: 0.6; }
}

/* ── Search ── */
.search-container { max-width: 650px; margin: 20px auto 50px; position: relative; }
.sr {
  display: flex; align-items: center; gap: 16px;
  background: rgba(26, 29, 38, 0.8); border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 22px; padding: 20px 28px;
  backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
  transition: all .4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
.sr:focus-within {
  border-color: ${T.accent}; background: rgba(26, 29, 38, 0.95);
  box-shadow: 0 15px 50px rgba(255, 110, 40, 0.18), inset 0 0 12px rgba(255, 110, 40, 0.05);
  transform: translateY(-3px);
}
.sr svg { color: ${T.textDim}; transition: all .3s; }
.sr:focus-within svg { color: ${T.accent}; transform: scale(1.1); }
.sr input {
  flex: 1; background: none; border: none; outline: none;
  color: ${T.text}; font-family: 'Vazirmatn', sans-serif; font-size: 1.05rem; font-weight: 400;
}
.sr input::placeholder { color: ${T.textDim}; }

/* ── Categories ── */
.tabs {
  display: flex; gap: 12px; overflow-x: auto; padding-bottom: 16px;
  justify-content: center; flex-wrap: wrap; margin-bottom: 40px;
}
.tabs::-webkit-scrollbar { display: none; }
.tb {
  background: rgba(255,255,255,0.02); border: 1px solid ${T.border};
  backdrop-filter: blur(8px); color: ${T.textMuted};
  font-size: .9rem; font-weight: 500; padding: 12px 28px; border-radius: 14px;
  cursor: pointer; transition: all .3s ease;
}
.tb:hover {
  background: rgba(255,255,255,0.05); color: ${T.text};
  border-color: rgba(255,255,255,0.15); transform: translateY(-2px);
}
.tb-on {
  background: ${T.text} !important; color: ${T.bgDeep} !important;
  border-color: transparent !important; font-weight: 600;
  box-shadow: 0 8px 24px rgba(255,255,255,0.1);
}

/* ── Stats ── */
.st {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px; background: rgba(255,255,255,0.01);
  border-radius: 14px; border: 1px solid ${T.border}; margin-bottom: 32px;
}
.st-n { font-size: .88rem; color: ${T.textMuted}; }
.st-n strong { color: ${T.text}; font-weight: 600; }
.st-h { font-size: .84rem; color: ${T.textDim}; }

/* ── Grid & Cards ── */
.gr { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 30px; }
.cd {
  background: ${T.card}; border: 1px solid ${T.border};
  border-radius: ${T.r}; overflow: hidden;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  transition: all .4s cubic-bezier(0.16, 1, 0.3, 1); position: relative;
}
.cd:hover {
  transform: translateY(-8px); border-color: ${T.borderHov};
  box-shadow: 0 20px 40px ${T.shadow}, 0 0 30px ${T.accentGlow};
}

.ci { position: relative; width: 100%; height: 230px; overflow: hidden; background: #13151c; }
.ci img { width: 100%; height: 100%; object-fit: cover; transition: transform .6s cubic-bezier(0.16, 1, 0.3, 1); }
.cd:hover .ci img { transform: scale(1.06); }
.ci-ov {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(11, 12, 16, 0.95) 0%, rgba(11, 12, 16, 0.2) 60%, transparent 100%);
}
.ci-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 4rem; }
.cb {
  position: absolute; top: 16px; right: 16px; z-index: 5;
  background: rgba(11, 12, 16, 0.75); backdrop-filter: blur(10px);
  color: ${T.text}; font-size: .75rem; font-weight: 500; padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
}

/* ── Discount Badge on Card ── */
.disc-badge {
  position: absolute; top: 16px; left: 16px; z-index: 5;
  background: linear-gradient(135deg, ${T.accentHot}, ${T.accent});
  color: #fff; font-size: .72rem; font-weight: 700; padding: 6px 12px; border-radius: 8px;
  box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  display: flex; align-items: center; gap: 4px;
}

/* ── Stock Badge ── */
.stock-badge {
  position: absolute; bottom: 16px; left: 16px; z-index: 5;
  font-size: .7rem; font-weight: 600; padding: 4px 10px; border-radius: 6px;
  backdrop-filter: blur(8px);
}
.stock-low { background: rgba(255, 234, 167, 0.15); color: ${T.goldBright}; border: 1px solid rgba(241, 196, 15, 0.3); }
.stock-out { background: rgba(255, 71, 87, 0.15); color: #ff4757; border: 1px solid rgba(255, 71, 87, 0.3); }

.bd { padding: 24px; position: relative; }
.bn { font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; color: ${T.text}; }
.bd-dsc { font-size: .88rem; color: ${T.textMuted}; line-height: 1.7; margin-bottom: 24px; height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bf { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bp { font-size: 1.35rem; font-weight: 800; color: ${T.text}; display: flex; align-items: baseline; gap: 4px; }
.bu { font-size: .8rem; font-weight: 400; color: ${T.textMuted}; margin-right: 2px; }

/* ── Old Price Strikethrough ── */
.bp-old {
  font-size: .9rem; font-weight: 500; color: ${T.textDim};
  text-decoration: line-through; margin-left: 8px; direction: ltr;
}
.bp-new { color: ${T.accent}; }

.bs { display: flex; align-items: center; gap: 3px; margin-top: 4px; }

/* ── Button ── */
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: transparent; color: ${T.text};
  border: 1px solid rgba(255,255,255,0.15); font-family: 'Vazirmatn', sans-serif;
  font-size: .88rem; font-weight: 600; padding: 12px 22px; border-radius: 12px;
  cursor: pointer; transition: all 0.3s ease;
}
.btn:hover {
  background: ${T.text}; color: ${T.bgDeep};
  border-color: transparent; transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255,255,255,0.1);
}
.btn-ok {
  background: ${T.green} !important; color: #fff !important;
  border-color: transparent !important;
  box-shadow: 0 8px 20px rgba(0, 184, 148, 0.2) !important;
}
.btn-na {
  opacity: .4; cursor: not-allowed !important; pointer-events: none;
}

/* ── Loading ── */
.ld { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 0; gap: 20px; }
.sp {
  width: 44px; height: 44px; border: 2px solid ${T.border};
  border-top-color: ${T.text}; border-radius: 50%; animation: sp 0.8s linear infinite;
}
@keyframes sp { to { transform: rotate(360deg); } }
.ld-t { color: ${T.textMuted}; font-size: .95rem; }

/* ── Floating Cart ── */
.cf {
  position: fixed; bottom: 36px; left: 50%; transform: translateX(-50%);
  background: ${T.text}; color: ${T.bgDeep}; font-family: 'Vazirmatn', sans-serif;
  font-size: .95rem; font-weight: 700; padding: 16px 36px; border-radius: 100px;
  z-index: 100; display: flex; align-items: center; gap: 12px;
  box-shadow: 0 16px 32px rgba(0,0,0,0.4), 0 4px 12px rgba(255,255,255,0.1);
  transition: all .3s cubic-bezier(0.16, 1, 0.3, 1); text-decoration: none;
}
.cf:hover {
  transform: translateX(-50%) translateY(-4px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 4px 20px rgba(255,255,255,0.15);
}
.cf-n {
  background: ${T.bgDeep}; color: ${T.text};
  min-width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700;
}

/* ── Error State ── */
.err-state {
  text-align: center; padding: 80px 20px; color: ${T.textMuted};
}
.err-state h3 { font-size: 1.2rem; margin-bottom: 10px; color: ${T.text}; }
.err-state p { font-size: .9rem; margin-bottom: 20px; }
.retry-btn {
  background: transparent; color: ${T.accent}; border: 1px solid ${T.accent};
  font-family: 'Vazirmatn', sans-serif; font-size: .88rem; font-weight: 600;
  padding: 10px 28px; border-radius: 12px; cursor: pointer; transition: all .3s;
}
.retry-btn:hover { background: ${T.accent}; color: #fff; }

@media(max-width: 992px) {
  .hp { flex-direction: column; text-align: center; gap: 30px; padding: 30px 0; }
  .hero-content { text-align: center; width: 100%; }
  .hs { margin: 0 auto; }
  .hero-visual { min-height: 300px; width: 100%; }
  .hero-food-plate { width: 300px; height: 300px; }
  .hero-badge { right: 10px; bottom: 10px; }
}
@media(max-width: 768px) {
  .w { padding: 20px 16px 100px; }
  .gr { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  .tabs { justify-content: flex-start; flex-wrap: nowrap; }
}
`;

/* ═══════════════════════════════════════════════════════
 * Helper: Paginated Fetch (DRF next/prev)
 * ═══════════════════════════════════════════════════════ */
async function fetchAllPages(url) {
  const all = [];
  let cur = url;
  while (cur) {
    const { data } = await axios.get(cur);
    const items = data.results || data || [];
    all.push(...items);
    cur = data.next || null;
  }
  return all;
}

/* ═══════════════════════════════════════════════════════
 * Emoji pool
 * ═══════════════════════════════════════════════════════ */
const emojis = ['🍔','🍕','🌮','🍟','🍗','🥩','🥗','🌯','🌭','🥪','🍜','🍝','🍛','🍱'];

/* ═══════════════════════════════════════════════════════
 * FoodCard — با پشتیبانی تخفیف و موجودی
 * ═══════════════════════════════════════════════════════ */
function FoodCard({ food, catName, onAdd }) {
  const [ok, setOk] = useState(false);
  const tm = useRef(null);

  const add = useCallback(() => {
    setOk(true);
    onAdd(food);
    clearTimeout(tm.current);
    tm.current = setTimeout(() => setOk(false), 1200);
  }, [food, onAdd]);

  useEffect(() => () => clearTimeout(tm.current), []);

  const originalPrice = Number(food.kitchen_price || food.price || 0);
  const finalPrice    = Number(food.final_price || food.price || 0);
  const hasDiscount   = food.discount != null && finalPrice < originalPrice;
  const stock         = food.stock;
  const outOfStock    = stock !== null && stock !== undefined && stock <= 0;
  const lowStock      = stock !== null && stock !== undefined && stock > 0 && stock <= 3;
  const emoji         = emojis[(food.id || 0) % emojis.length];

  return (
    <div className={`cd${outOfStock ? ' btn-na' : ''}`}>
      <div className="ci">
        {food.image
          ? <img
              src={food.image?.startsWith('http') ? food.image : `${API}${food.image}`}
              alt={food.name} loading="lazy"
            />
          : <div className="ci-ph">{emoji}</div>}
        <div className="ci-ov" />
        {catName && <span className="cb">{catName}</span>}

        {hasDiscount && (
          <span className="disc-badge">
            <FireSVG />
            {food.discount.discount_type === 'percentage'
              ? `${food.discount.value}% تخفیف`
              : `${Number(food.discount.value).toLocaleString('fa-IR')} ت`}
          </span>
        )}

        {outOfStock && (
          <span className="stock-badge stock-out">ناموجود</span>
        )}
        {!outOfStock && lowStock && (
          <span className="stock-badge stock-low">فقط {stock} عدد</span>
        )}
      </div>

      <div className="bd">
        <div className="bn">{food.name}</div>
        {food.description && <div className="bd-dsc">{food.description}</div>}
        <div className="bf">
          <div className="bf-l">
            <div className="bp">
              {hasDiscount && (
                <span className="bp-old">{originalPrice.toLocaleString('fa-IR')}</span>
              )}
              <span className={hasDiscount ? 'bp-new' : ''}>
                {finalPrice > 0 ? finalPrice.toLocaleString('fa-IR') : '—'}
              </span>
              <span className="bu">تومان</span>
            </div>
            <div className="bs">
              {[1,2,3,4,5].map(i => <StarSVG key={i} filled={i <= 4} />)}
            </div>
          </div>
          <button
            className={`btn${ok ? ' btn-ok' : ''}${outOfStock ? ' btn-na' : ''}`}
            onClick={outOfStock ? undefined : add}
            disabled={outOfStock}
          >
            {outOfStock
              ? 'ناموجود'
              : ok
                ? <><CheckSVG /> اضافه شد</>
                : <><CartSVG /> افزودن</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * buildFood — dictionary + kitchen merge
 * ═══════════════════════════════════════════════════════ */
function buildFood(dict, kitchen) {
  const kitchenPrice = kitchen
    ? (kitchen.selling_price || kitchen.price || kitchen.kitchen_price || 0)
    : (dict ? (dict.price || 0) : 0);

  const stock = kitchen
    ? (kitchen.stock != null ? kitchen.stock
      : kitchen.current_stock != null ? kitchen.current_stock : null)
    : null;

  const discount = kitchen?.discount || null;
  const finalPrice = discount
    ? (discount.discounted_price || kitchenPrice)
    : kitchenPrice;

  return {
    id:            dict ? dict.id : kitchen.id,
    name:          dict ? (dict.name || '') : (kitchen.name || ''),
    category_id:   dict ? (dict.category_id ?? null) : (kitchen.category_id ?? null),
    category_name: dict ? (dict.category_name || '') : (kitchen.category_name || ''),
    description:   dict ? (dict.description || '') : (kitchen.description || ''),
    kitchen_price: kitchenPrice,
    final_price:   finalPrice,
    stock:         stock,
    image:         kitchen ? (kitchen.image || null) : (dict ? (dict.image || null) : null),
    is_ready:      kitchen ? (kitchen.is_ready || false) : false,
    discount:      discount,
  };
}

/* ═══════════════════════════════════════════════════════
 * ★ Main Menu — ★ اصلاح شده: public API + fallback
 * ═══════════════════════════════════════════════════════ */
function Menu({ onAddToCart, cartCount = 0 }) {
  const [foods, setFoods] = useState([]);
  const [cats, setCats]   = useState([]);
  const [sel, setSel]     = useState(null);
  const [q, setQ]         = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* ★ API عمومی — بدون لاگین ★ */
      const [kitchenRes, dictRes] = await Promise.allSettled([
        fetchAllPages(`${API}/api/kitchen/public-products/?page_size=500`),
        axios.get(`${API}/api/dictionary/food-menu/`).catch(() => null),
      ]);

      const kitchenItems = kitchenRes.status === 'fulfilled' ? kitchenRes.value : [];
      let dictItems = [];
      if (dictRes.status === 'fulfilled' && dictRes.value) {
        const d = dictRes.value.data;
        dictItems = d.items || d.results || d || [];
      }

      /* ── اگه هیچ داده‌ای نبود → خطا ── */
      if (kitchenItems.length === 0 && dictItems.length === 0) {
        throw new Error('هیچ محصولی یافت نشد — لطفاً بعداً تلاش کنید');
      }

      /* ── Maps ── */
      const kMap = {};
      kitchenItems.forEach(k => { kMap[String(k.id)] = k; });

      const dMap = {};
      dictItems.forEach(d => { dMap[String(d.id)] = d; });

      /* ── Merge: dictionary (name+category) + kitchen (price+stock) ── */
      const merged = [];
      const doneIds = {};

      dictItems.forEach(dict => {
        const k = kMap[String(dict.id)] || null;
        merged.push(buildFood(dict, k));
        doneIds[String(dict.id)] = true;
      });
      kitchenItems.forEach(k => {
        if (!doneIds[String(k.id)]) {
          merged.push(buildFood(null, k));
        }
      });

      /* ── Categories از merged data ── */
      const catMap = {};
      merged.forEach(f => {
        const cid = String(f.category_id || '');
        if (cid && !catMap[cid]) {
          catMap[cid] = { id: f.category_id, name: f.category_name || 'بدون دسته' };
        }
      });
      const catsArr = Object.values(catMap);

      setFoods(merged);
      setCats(catsArr);
      if (catsArr.length > 0 && sel === null) setSel(catsArr[0].id);

    } catch (e) {
      console.error('[Menu] load error:', e);
      setError(e.message || 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Category Map ── */
  const cMap = useMemo(() => {
    const m = {};
    cats.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [cats]);

  /* ── Filter + Search ── */
  const list = useMemo(() => {
    let base = foods;
    if (sel !== null && sel !== 0) {
      base = base.filter(f => String(f.category_id) === String(sel));
    }
    if (!q.trim()) return base;
    const s = q.trim().toLowerCase();
    return base.filter(f =>
      f.name?.toLowerCase().includes(s) ||
      f.description?.toLowerCase().includes(s) ||
      (cMap[f.category_id] || '').toLowerCase().includes(s)
    );
  }, [foods, sel, q, cMap]);

  const aName = sel === 0 ? 'همه دسته‌بندی‌ها' : (cMap[sel] || 'فیلتر شده');

  /* ── Error State ── */
  if (error && !loading && foods.length === 0) {
    return (
      <div className="mp">
        <style>{css}</style>
        <AmbientBackground />
        <div className="w">
          <div className="err-state">
            <h3>خطا در بارگذاری منو</h3>
            <p>{error}</p>
            <button className="retry-btn" onClick={loadData}>تلاش مجدد</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mp">
      <style>{css}</style>
      <AmbientBackground />

      <div className="w">
        {/* Hero */}
        <div className="hp">
          <div className="hero-content">
            <div className="hb"><SparklesSVG /> طعم اصیل و به‌یادماندنی</div>
            <h1>منوی پرمیوم <br /><span className="hl">رستوران ما</span></h1>
            <p className="hs">انتخابی از بهترین مواد اولیه تازه، طبخ‌شده با استانداردهای بین‌المللی و سرآشپزهای مجرب.</p>
          </div>
          <div className="hero-visual">
            <div className="hero-img-backdrop" />
            <div className="hero-food-plate">
              <img
                src="/img/HotBurger.jpg"
                alt="Premium Hot Burger"
                style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div className="hero-badge">
              <div className="hero-badge-icon">🔥</div>
              <div className="hero-badge-text">
                <div>ارسال اکسپرس</div>
                <div>کمتر از ۳۰ دقیقه</div>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="search-container">
          <div className="sr">
            <SearchSVG />
            <input
              type="text"
              placeholder="جستجوی هوشمند غذا (برگر، پیتزا، پاستا...)"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Categories */}
        {!loading && cats.length > 0 && (
          <div className="tabs">
            {cats.map(c => (
              <button
                key={c.id}
                className={`tb${sel === c.id ? ' tb-on' : ''}`}
                onClick={() => setSel(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        {!loading && sel !== null && (
          <div className="st">
            <span className="st-n">یافت شد: <strong>{list.length} گزینه</strong></span>
            <span className="st-h">{q ? `نتایج جستجو برای «${q}»` : aName}</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="ld">
            <div className="sp" />
            <span className="ld-t">در حال آماده‌سازی منو...</span>
          </div>
        ) : sel === null ? (
          <div className="ld">
            <div className="sp" />
            <span className="ld-t">در حال آماده‌سازی...</span>
          </div>
        ) : list.length === 0 ? (
          <div className="err-state">
            <h3>گزینه‌ای یافت نشد</h3>
            <p>لطفاً دسته‌بندی دیگری را انتخاب کرده یا عبارت جستجو را تغییر دهید.</p>
          </div>
        ) : (
          <div className="gr">
            {list.map(f => (
              <FoodCard
                key={f.id}
                food={f}
                catName={cMap[f.category_id]}
                onAdd={onAddToCart}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart */}
      {cartCount > 0 && (
        <Link to="/cart" className="cf">
          <CartSVG /> مشاهده سبد خرید
          <span className="cf-n">{cartCount}</span>
          <ArrowSVG />
        </Link>
      )}
    </div>
  );
}

export default Menu;