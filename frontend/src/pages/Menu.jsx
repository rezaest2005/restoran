// src/pages/Menu.jsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://192.168.240.235:8000';

/* ═══════════════════════════════════════════════════════
 * تم رنگی جدید: Midnight Luxury Glow (تاریک مدرن و لوکس)
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

/* ── Ambient Background ── */
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

/* ── 👑 ULTRA PREMIUM HERO LAYOUT ── */
.hp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  padding: 60px 0 40px;
}
.hero-content {
  flex: 1.2;
  text-align: right;
}
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

/* ── 🍔 DYNAMIC FLOATING FOOD VISUAL ── */
.hero-visual {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  min-height: 400px;
}
.hero-img-backdrop {
  position: absolute;
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(255, 110, 40, 0.4) 0%, rgba(255, 69, 0, 0.05) 60%, transparent 100%);
  filter: blur(50px);
  z-index: -1;
  animation: pulseGlow 4s ease-in-out infinite alternate;
}
.hero-food-plate {
  position: relative;
  width: 420px;
  height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: floatingFood 6s ease-in-out infinite;
  filter: drop-shadow(0 35px 50px rgba(0,0,0,0.7));
}
.hero-food-plate img {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.hero-food-plate:hover img {
  transform: scale(1.04) rotate(3deg) !important;
}

/* Floating Premium Badge */
.hero-badge {
  position: absolute;
  bottom: 40px;
  right: -10px;
  background: rgba(26, 29, 38, 0.75);
  border: 1px solid rgba(255, 110, 40, 0.25);
  backdrop-filter: blur(20px);
  padding: 14px 22px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.6);
  animation: floatingFood 6s ease-in-out infinite reverse 1s;
  z-index: 10;
}
.hero-badge-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${T.accent}, ${T.accentHot});
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
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

/* ── 🔍 GLOWING CENTER SEARCH BAR ── */
.search-container {
  max-width: 650px;
  margin: 20px auto 50px;
  position: relative;
}
.sr {
  display: flex; align-items: center; gap: 16px;
  background: rgba(26, 29, 38, 0.8); border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 22px; padding: 20px 28px;
  backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
  transition: all .4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
.sr:focus-within {
  border-color: ${T.accent};
  background: rgba(26, 29, 38, 0.95);
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

/* ── Luxury Categories Tabs ── */
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

/* ── Stats Bar ── */
.st {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px; background: rgba(255,255,255,0.01);
  border-radius: 14px; border: 1px solid ${T.border}; margin-bottom: 32px;
}
.st-n { font-size: .88rem; color: ${T.textMuted}; }
.st-n strong { color: ${T.text}; font-weight: 600; }
.st-h { font-size: .84rem; color: ${T.textDim}; }

/* ── Grid & Modern Cards ── */
.gr { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 30px; }
.cd {
  background: ${T.card}; border: 1px solid ${T.border};
  border-radius: ${T.r}; overflow: hidden;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  transition: all .4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
.cd:hover {
  transform: translateY(-8px);
  border-color: ${T.borderHov};
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

.bd { padding: 24px; position: relative; }
.bn { font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; color: ${T.text}; }
.bd-dsc { font-size: .88rem; color: ${T.textMuted}; line-height: 1.7; margin-bottom: 24px; height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bf { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bp { font-size: 1.35rem; font-weight: 800; color: ${T.text}; display: flex; align-items: baseline; gap: 4px; }
.bu { font-size: .8rem; font-weight: 400; color: ${T.textMuted}; margin-right: 2px; }
.bs { display: flex; align-items: center; gap: 3px; margin-top: 4px; }

/* ── Minimal Premium Button ── */
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

/* ── Loading Spinner ── */
.ld { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 0; gap: 20px; }
.sp {
  width: 44px; height: 44px; border: 2px solid ${T.border};
  border-top-color: ${T.text}; border-radius: 50%; animation: sp 0.8s linear infinite;
}
@keyframes sp { to { transform: rotate(360deg); } }
.ld-t { color: ${T.textMuted}; font-size: .95rem; }

/* ── Floating Cart Button ── */
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
 * Food Card Component
 * ═══════════════════════════════════════════════════════ */
const emojis = ['🍔','🍕','🌮','🍟','🍗','🥩','🥗','🌯','🌭','🥪','🍜','🍝','🍛','🍱'];

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

  const price = Number(food.final_price || food.price || 0);
  const emoji = emojis[(food.id || 0) % emojis.length];

  return (
    <div className="cd">
      <div className="ci">
        {food.image
          ? <img src={food.image} alt={food.name} loading="lazy" />
          : <div className="ci-ph">{emoji}</div>}
        <div className="ci-ov" />
        {catName && <span className="cb">{catName}</span>}
      </div>

      <div className="bd">
        <div className="bn">{food.name}</div>
        {food.description && <div className="bd-dsc">{food.description}</div>}
        <div className="bf">
          <div className="bf-l">
            <div className="bp">
              {price.toLocaleString('fa-IR')}
              <span className="bu">تومان</span>
            </div>
            <div className="bs">
              {[1,2,3,4,5].map(i => <StarSVG key={i} filled={i <= 4} />)}
            </div>
          </div>
          <button className={`btn${ok ? ' btn-ok' : ''}`} onClick={add}>
            {ok ? <><CheckSVG /> اضافه شد</> : <><CartSVG /> افزودن</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * Main Menu Component
 * ═══════════════════════════════════════════════════════ */
function Menu({ onAddToCart, cartCount = 0 }) {
  const [cats, setCats]     = useState([]);
  const [foods, setFoods]   = useState([]);
  const [sel, setSel]       = useState(null);
  const [q, setQ]           = useState('');
  const [ld1, setLd1]       = useState(true);
  const [ld2, setLd2]       = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/categories/`)
      .then(r => {
        const d = r.data.results || r.data;
        const arr = Array.isArray(d) ? d : [];
        if (arr.length > 0) setSel(arr[0].id);
        setCats(arr);
      })
      .catch(e => console.error(e))
      .finally(() => setLd1(false));
  }, []);

  useEffect(() => {
    if (sel === null) return;
    setLd2(true);
    const u = sel === 0
      ? `${API}/api/foods/`
      : `${API}/api/foods/?category=${sel}`;
    axios.get(u)
      .then(r => { const d = r.data.results || r.data; setFoods(Array.isArray(d) ? d : []); })
      .catch(e => console.error(e))
      .finally(() => setLd2(false));
  }, [sel]);

  const cMap = useMemo(() => {
    const m = {}; cats.forEach(c => { m[c.id] = c.name; }); return m;
  }, [cats]);

  const list = useMemo(() => {
    if (!q.trim()) return foods;
    const s = q.trim().toLowerCase();
    return foods.filter(f =>
      f.name?.toLowerCase().includes(s) ||
      f.description?.toLowerCase().includes(s) ||
      (cMap[f.category] || '').toLowerCase().includes(s)
    );
  }, [foods, q, cMap]);

  const aName = sel === 0 ? 'همه دسته‌بندی‌ها' : (cMap[sel] || 'فیلتر شده');

  return (
    <div className="mp">
      <style>{css}</style>
      <AmbientBackground />

      <div className="w">
        {/* 👑 هیرو باکس لوکس دوقلو */}
        <div className="hp">
          <div className="hero-content">
            <div className="hb"><SparklesSVG /> طعم اصیل و به‌یادماندنی</div>
            <h1>منوی پرمیوم <br /><span className="hl">رستوران ما</span></h1>
            <p className="hs">انتخابی از بهترین مواد اولیه تازه، طبخ‌شده با استانداردهای بین‌المللی و سرآشپزهای مجرب.</p>
          </div>

          {/* 🍔 تصویر شناور دایره‌ای و جذاب غذا */}
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

        {/* 🔍 باکس جستجوی هوشمند */}
        <div className="search-container">
          <div className="sr">
            <SearchSVG />
            <input type="text" placeholder="جستجوی هوشمند غذا (برگر، پیتزا، پاستا...)" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        {!ld1 && cats.length > 0 && (
          <div className="tabs">
            {cats.map(c => (
              <button key={c.id} className={`tb${sel === c.id ? ' tb-on' : ''}`} onClick={() => setSel(c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        {!ld2 && sel !== null && (
          <div className="st">
            <span className="st-n">یافت شد: <strong>{list.length} گزینه</strong></span>
            <span className="st-h">{q ? `نتایج جستجو برای «${q}»` : aName}</span>
          </div>
        )}

        {ld2 || sel === null ? (
          <div className="ld">
            <div className="sp" />
            <span className="ld-t">در حال آماده‌سازی منو...</span>
          </div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: T.textMuted }}>
            <h3>گزینه‌ای یافت نشد</h3>
            <p style={{ fontSize: '.9rem', marginTop: '8px' }}>لطفاً دسته‌بندی دیگری را انتخاب کرده یا عبارت جستجو را تغییر دهید.</p>
          </div>
        ) : (
          <div className="gr">
            {list.map((f) => (
              <FoodCard key={f.id} food={f}
                catName={cMap[f.category] || cMap[f.category_id]} onAdd={onAddToCart} />
            ))}
          </div>
        )}
      </div>

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