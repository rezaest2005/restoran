// src/pages/Home.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

/* ═══════════════════════════════════════════════════════
 * تم رنگی لوکس و داغ (Midnight Luxury Glow)
 * ═══════════════════════════════════════════════════════ */
const T = {
  bg:        '#080503',
  bgDeep:    '#040201',
  surface:   'rgba(20,14,10,0.92)',
  card:      'rgba(26,18,13,0.8)',
  border:    'rgba(255,90,26,0.12)',
  borderHov: 'rgba(255,90,26,0.4)',
  accent:    '#ff5a1a',
  accentHot: '#ff3d00',
  accentGlow:'#ff7b3a',
  goldBright:'#ffbe3a',
  text:      '#fff5ec',
  textMuted: '#b89a80',
  textDim:   '#7a6555',
  shadow:    'rgba(0,0,0,0.7)',
  r:         '24px',
};

/* ═══════════════════════════════════════════════════════
 * ذرات آتشین متحرک پس‌زمینه
 * ═══════════════════════════════════════════════════════ */
function Embers() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    let raf; let pts = [];
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const cols = ['rgba(255,90,26,','rgba(255,140,40,','rgba(255,60,0,','rgba(255,190,58,'];
    for (let i = 0; i < 30; i++) pts.push({
      x: Math.random()*c.width, y: Math.random()*c.height,
      r: Math.random()*2+0.5, dx: (Math.random()-0.5)*0.2,
      dy: -(Math.random()*0.4+0.1), col: cols[~~(Math.random()*cols.length)],
      a: Math.random()*0.4+0.1, p: Math.random()*Math.PI*2,
      ps: Math.random()*0.01+0.005,
    });
    const draw = () => {
      ctx.clearRect(0,0,c.width,c.height);
      pts.forEach(p => {
        p.x+=p.dx; p.y+=p.dy; p.p+=p.ps;
        const a = p.a*(0.5+0.5*Math.sin(p.p));
        if(p.y<-10){p.y=c.height+10;p.x=Math.random()*c.width}
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=p.col+a+')'; ctx.fill();
      });
      raf=requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{position:'fixed',inset:0,zIndex:1,pointerEvents:'none',opacity:0.5}} />;
}

/* ═══════════════════════════════════════════════════════
 * شمارنده متحرک اختصاصی
 * ═══════════════════════════════════════════════════════ */
function Counter({ end, suffix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = null;
        const step = (ts) => {
          if (!start) start = ts;
          const progress = Math.min((ts - start) / 1500, 1);
          setVal(Math.floor(progress * end));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end]);
  return <span ref={ref}>{val.toLocaleString('fa-IR')}{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════
 * استایل‌های نئونی و گلس‌مورفیسم منسجم
 * ═══════════════════════════════════════════════════════ */
const css = `
.hp * { margin: 0; padding: 0; box-sizing: border-box; }
.hp {
  font-family: 'Vazirmatn', sans-serif; direction: rtl; text-align: right;
  background: ${T.bg}; color: ${T.text}; min-height: 100vh; overflow-x: hidden; position: relative;
}

.w { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; padding: 0 24px; }

/* ── HERO SECTION (ترکیب دو ستونه هوشمند) ── */
.hero { min-height: 90vh; display: flex; align-items: center; padding-top: 100px; position: relative; }
.hero-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 40px; align-items: center; width: 100%; }

.hero-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(255,90,26,0.08); border: 1px solid ${T.border};
  color: ${T.goldBright}; font-weight: 700; font-size: .85rem;
  padding: 8px 20px; border-radius: 50px; margin-bottom: 24px;
}

.hero h1 { font-size: clamp(2.5rem, 5vw, 4.5rem); font-weight: 900; line-height: 1.15; margin-bottom: 20px; }
.hl {
  background: linear-gradient(135deg, ${T.accentHot}, ${T.goldBright});
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}

.hero-sub { color: ${T.textMuted}; font-size: 1.1rem; line-height: 1.8; margin-bottom: 36px; max-width: 500px; }

.hero-btns { display: flex; gap: 16px; }
.hb-primary {
  background: linear-gradient(135deg, ${T.accent}, ${T.accentHot}); color: #fff;
  font-weight: 700; padding: 16px 38px; border-radius: 50px; text-decoration: none;
  box-shadow: 0 10px 30px rgba(255,90,26,0.3); transition: all 0.3s ease;
}
.hb-primary:hover { transform: translateY(-3px); box-shadow: 0 15px 40px rgba(255,90,26,0.5); }

.hb-secondary {
  border: 1px solid ${T.border}; color: ${T.text}; backdrop-filter: blur(10px);
  font-weight: 600; padding: 16px 38px; border-radius: 50px; text-decoration: none; transition: all 0.3s ease;
}
.hb-secondary:hover { border-color: ${T.accent}; background: rgba(255,90,26,0.05); transform: translateY(-3px); }

/* نمایشگر تصویر نئونی در هیرو */
.hero-image-wrapper { position: relative; display: flex; justify-content: center; }
.hero-img {
  width: 100%; max-width: 450px; height: auto; border-radius: ${T.r};
  filter: drop-shadow(0 20px 50px rgba(255,90,26,0.25));
  animation: floatAnim 4s ease-in-out infinite alternate;
}
.hero-img-glow {
  position: absolute; width: 300px; height: 300px; background: ${T.accent};
  filter: blur(120px); opacity: 0.2; z-index: -1; top: 10%;
}

@keyframes floatAnim { from { transform: translateY(0); } to { transform: translateY(-15px); } }

/* ── STATS SECTION ── */
.stats { padding: 60px 0; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.stat-card {
  background: ${T.card}; border: 1px solid ${T.border}; border-radius: ${T.r};
  padding: 30px 20px; text-align: center; backdrop-filter: blur(10px); transition: all 0.3s ease;
}
.stat-card:hover { transform: translateY(-5px); border-color: ${T.borderHov}; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
.stat-num { font-size: 2.2rem; font-weight: 900; color: ${T.goldBright}; margin-top: 8px; }
.stat-label { font-size: 0.9rem; color: ${T.textMuted}; }

/* ── INSIGHT SECTION (بخش خلاقانه چرا ما با تصویر متقارن) ── */
.insight { padding: 100px 0; }
.insight-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 60px; align-items: center; }
.insight-img { width: 100%; border-radius: ${T.r}; border: 1px solid ${T.border}; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }

.feat-item { display: flex; gap: 20px; margin-bottom: 30px; }
.feat-icon {
  width: 54px; height: 54px; background: rgba(255,90,26,0.1); border: 1px solid rgba(255,90,26,0.2);
  border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;
}
.feat-item h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 6px; color: #fff; }
.feat-item p { color: ${T.textMuted}; font-size: 0.95rem; line-height: 1.6; }

/* ── CTA SECTION ── */
.cta { padding: 100px 0; text-align: center; position: relative; }
.cta-box {
  background: linear-gradient(135deg, ${T.card}, rgba(15,10,7,0.95));
  border: 1px solid ${T.border}; border-radius: 32px; padding: 60px 40px; position: relative; overflow: hidden;
}
.cta-box::before {
  content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 120%, rgba(255,90,26,0.15), transparent 60%);
}
.cta h2 { font-size: 2.5rem; font-weight: 800; margin-bottom: 16px; }

/* ── FOOTER ── */
.foot { padding: 40px 0; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); color: ${T.textDim}; font-size: 0.85rem; }
.foot-links { display: flex; gap: 24px; justify-content: center; margin-bottom: 16px; }
.foot-link { color: ${T.textMuted}; text-decoration: none; transition: color 0.2s; }
.foot-link:hover { color: ${T.accent}; }

@media(max-width: 968px) {
  .hero-grid, .insight-grid { grid-template-columns: 1fr; text-align: center; }
  .hero-sub, .hero-btns { margin-left: auto; margin-right: auto; justify-content: center; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .hero-image-wrapper { order: -1; } /* تصویر در موبایل بالا می‌رود */
}
`;

function Home() {
  return (
    <div className="hp">
      <style>{css}</style>
      <Embers />

      {/* 👑 HERO SECTION */}
      <section className="hero">
        <div className="w">
          <div className="hero-grid">
            <div>
              <div className="hero-badge">🔥 بهترین طعم، لوکس‌ترین تجربه</div>
              <h1>تجربه‌ای <span className="hl">آتشین</span> و ماندگار</h1>
              <p className="hero-sub">
                با دستورهای اصیل، آشپزی هنرمندانه روی شعله مستقیم و مواد اولیه ارگانیک، طعمی خلق می‌کنیم که فراموش نخواهید کرد.
              </p>
              <div className="hero-btns">
                <Link to="/menu" className="hb-primary">مشاهده منو و سفارش</Link>
                <Link to="/reservation" className="hb-secondary">رزرو میز VIP</Link>
              </div>
            </div>
            
            <div className="hero-image-wrapper">
              <div className="hero-img-glow" />
              {/* تصویر معلق و آتشین تولید شده توسط نانو بنانا */}
              <img src="/images/hero-burger.png" alt="Lumiere Burger" className="hero-img" />
            </div>
          </div>
        </div>
      </section>

      {/* 📊 STATS SECTION */}
      <section className="stats">
        <div className="w">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-num"><Counter end={120} suffix="+" /></div>
              <div className="stat-label">تنوع شاهکارهای منو</div>
            </div>
            <div className="stat-card">
              <div className="stat-num"><Counter end={4.9} /></div>
              <div className="stat-label">رضایت از طعم و خدمات</div>
            </div>
            <div className="stat-card">
              <div className="stat-num"><Counter end={5000} suffix="+" /></div>
              <div className="stat-label">سفارش موفق ماهانه</div>
            </div>
            <div className="stat-card">
              <div className="stat-num"><Counter end={3000} suffix="+" /></div>
              <div className="stat-label">مشتری وفادار و همیشگی</div>
            </div>
          </div>
        </div>
      </section>

      {/* 🎯 INSIGHT / FEATURES SECTION */}
      <section className="insight">
        <div className="w">
          <div className="insight-grid">
            {/* تصویر بشقاب لوکس تولید شده توسط هوش مصنوعی */}
            <img src="/images/premium-plate.png" alt="Premium Dining" className="insight-img" />
            
            <div>
              <div className="feat-item">
                <div className="feat-icon">🍳</div>
                <div>
                  <h3>مواد اولیه تازه و ممتاز</h3>
                  <p>تضمین استفاده از گوشت روز، سبزیجات کاملاً ارگانیک و سس‌های دست‌ساز بدون ذره‌ای نگهدارنده.</p>
                </div>
              </div>

              <div className="feat-item">
                <div className="feat-icon">⚡</div>
                <div>
                  <h3>سفارش هوشمند و تحویل داغ</h3>
                  <p>پلتفرم بهینه‌سازی شده برای تحویل سریع در بسته‌بندی‌های حرارتی مخصوص برای حفظ کیفیت اصلی غذا.</p>
                </div>
              </div>

              <div className="feat-item">
                <div className="feat-icon">👑</div>
                <div>
                  <h3>فضای رزرو اختصاصی</h3>
                  <p>امکان رزرو میزهای ویژه برای جلسات، مهمانی‌ها و قرارهای VIP با لاین سرویس مجزا.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 🚀 CTA SECTION */}
      <section className="cta">
        <div className="w">
          <div className="cta-box">
            <h2>آماده خلق یک خاطره خوشمزه هستید؟</h2>
            <p className="hero-sub" style={{margin: '0 auto 30px'}}>همین حالا منوی دیجیتال ما را بررسی کنید و سفارش خود را آنلاین ثبت کنید.</p>
            <Link to="/menu" className="hb-primary">شروع هیجان سفارش</Link>
          </div>
        </div>
      </section>

      {/* 📜 FOOTER */}
      <footer className="foot">
        <div className="w">
          <div className="foot-links">
            <Link to="/menu" className="foot-link">منو</Link>
            <Link to="/reservation" className="foot-link">رزرو میز</Link>
            <Link to="/cart" className="foot-link">سبد خرید</Link>
          </div>
          <div>تمامی حقوق محفوظ است © LUMIÈRE ۲۰۲۶</div>
        </div>
      </footer>
    </div>
  );
}

export default Home;