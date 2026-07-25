// src/pages/Cart.jsx

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

/* ═══════════════════════════════════════════
 *  Theme
 * ═══════════════════════════════════════════ */
const T = {
  bg:        '#080503',
  bgDeep:    '#040201',
  surface:   'rgba(20,14,10,0.92)',
  surface2:  '#18110d',
  card:      'rgba(26,18,13,0.94)',
  border:    'rgba(65,42,28,0.32)',
  borderHov: 'rgba(255,100,30,0.35)',
  accent:    '#ff5a1a',
  accentHot: '#ff3d00',
  accentDark:'#c94010',
  accentGlow:'#ff7b3a',
  fire:      '#ff2200',
  lava:      '#e84800',
  ember:     '#ff6b00',
  gold:      '#f0a020',
  goldBright:'#ffbe3a',
  goldDim:   'rgba(255,190,58,0.12)',
  green:     '#34d365',
  greenDark: '#1aad45',
  red:       '#ef4444',
  redDark:   '#b91c1c',
  text:      '#fff5ec',
  textMuted: '#b89a80',
  textDim:   '#7a6555',
  shadow:    'rgba(0,0,0,0.5)',
  r: '22px',
};

/* ═══════════════════════════════════════════
 *  CSRF Cookie
 * ═══════════════════════════════════════════ */
function getCookie(name) {
  let val = null;
  if (document.cookie && document.cookie !== '') {
    document.cookie.split(';').forEach(c => {
      c = c.trim();
      if (c.startsWith(name + '=')) {
        val = decodeURIComponent(c.substring(name.length + 1));
      }
    });
  }
  return val;
}

/* ═══════════════════════════════════════════
 *  SVG Icons
 * ═══════════════════════════════════════════ */
const CartSVG = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
  </svg>
);

const MinusSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const PlusSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashSVG = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const CheckSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const FireSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 3.5-7.4.4-.5 1.2-.3 1.3.3.2.9.5 1.7 1 2.4C12 9.6 13 7 13 4c0-.6.7-.9 1.1-.5C17.5 6.8 20 10 20 14c0 5.5-3.8 9-8 9z" />
  </svg>
);

const ArrowSVG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const MenuSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const UserSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const PhoneSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);

const ReceiptSVG = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="16" x2="12" y2="16" />
  </svg>
);

const CopySVG = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const BankSVG = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);

/* ═══════════════════════════════════════════
 *  Embers
 * ═══════════════════════════════════════════ */
function Embers() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf;
    let pts = [];
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const cols = [
      'rgba(255,90,26,',
      'rgba(255,140,40,',
      'rgba(255,60,0,',
      'rgba(255,190,58,',
      'rgba(232,72,0,',
    ];
    for (let i = 0; i < 25; i++) {
      pts.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.25,
        dy: -(Math.random() * 0.5 + 0.12),
        col: cols[~~(Math.random() * cols.length)],
        a: Math.random() * 0.4 + 0.12,
        p: Math.random() * Math.PI * 2,
        ps: Math.random() * 0.015 + 0.006,
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        p.p += p.ps;
        const a = p.a * (0.5 + 0.5 * Math.sin(p.p));
        if (p.y < -10) {
          p.y = c.height + 10;
          p.x = Math.random() * c.width;
        }
        if (p.x < -10) p.x = c.width + 10;
        if (p.x > c.width + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.col + a + ')';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = p.col + a * 0.12 + ')';
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', opacity: 0.6 }}
    />
  );
}

/* ═══════════════════════════════════════════
 *  Toast
 * ═══════════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: { bg: 'linear-gradient(135deg,#16a34a,#15803d)', shadow: 'rgba(34,197,94,0.4)' },
    error: { bg: 'linear-gradient(135deg,#dc2626,#b91c1c)', shadow: 'rgba(220,38,38,0.4)' },
  };
  const c = colors[type] || colors.success;

  return (
    <div
      style={{
        position: 'fixed',
        top: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        background: c.bg,
        color: '#fff',
        fontFamily: "'Vazirmatn', sans-serif",
        fontSize: '.92rem',
        fontWeight: 700,
        padding: '16px 32px',
        borderRadius: 16,
        boxShadow: `0 12px 40px ${c.shadow}, 0 4px 12px rgba(0,0,0,0.3)`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'tIn .5s cubic-bezier(.22,1,.36,1) forwards',
        direction: 'rtl',
      }}
    >
      <CheckSVG /> {message}
    </div>
  );
}

/* ═══════════════════════════════════════════
 *  PaymentPage
 * ═══════════════════════════════════════════ */
function PaymentPage({ orderId, total, customerName, onConfirm }) {
  const [copied, setCopied] = useState('');
  const cardNumber = '6219 8619 1234 5678';
  const sheba = 'IR12 0620 0000 0001 2345 6789 01';
  const holderName = 'رستوران ممتاز';

  const copy = (text, field) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    setCopied(field);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <>
      <style>{payCss}</style>
      <div className="pay-page">
        <div className="pay-card">
          <div className="pay-topline" />

          <div className="pay-header">
            <div className="pay-icon-ring">
              <BankSVG />
            </div>
            <h2>پرداخت سفارش</h2>
            <p>
              سفارش #{orderId} برای <strong>{customerName}</strong>
            </p>
          </div>

          <div className="pay-amount-box">
            <span className="pay-amount-label">مبلغ قابل پرداخت</span>
            <div className="pay-amount-val">
              {total.toLocaleString('fa-IR')}
              <span className="pay-amount-unit">تومان</span>
            </div>
          </div>

          <div className="pay-field">
            <span className="pay-field-label">شماره کارت</span>
            <div className="pay-field-row">
              <span className="pay-field-value mono">{cardNumber}</span>
              <button className="pay-copy-btn" onClick={() => copy(cardNumber, 'card')}>
                {copied === 'card' ? (
                  <>
                    <CheckSVG /> کپی شد
                  </>
                ) : (
                  <>
                    <CopySVG /> کپی
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pay-field">
            <span className="pay-field-label">شبا</span>
            <div className="pay-field-row">
              <span className="pay-field-value mono" style={{ fontSize: '.82rem' }}>
                {sheba}
              </span>
              <button className="pay-copy-btn" onClick={() => copy(sheba, 'sheba')}>
                {copied === 'sheba' ? (
                  <>
                    <CheckSVG /> کپی شد
                  </>
                ) : (
                  <>
                    <CopySVG /> کپی
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pay-field">
            <span className="pay-field-label">به نام</span>
            <div className="pay-field-row">
              <span className="pay-field-value">{holderName}</span>
            </div>
          </div>

          <div className="pay-divider" />

          <div className="pay-info">
            <span className="pay-info-icon">⚠️</span>
            <p>لطفاً مبلغ سفارش را به شماره کارت بالا واریز کرده و سپس دکمه زیر را بزنید.</p>
          </div>

          <button className="pay-confirm-btn" onClick={onConfirm}>
            <CheckSVG /> پرداخت کردم — ثبت نهایی
          </button>

          <button className="pay-back-btn" onClick={() => window.history.back()}>
            <ArrowSVG /> بازگشت
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
 *  Payment CSS
 * ═══════════════════════════════════════════ */
const payCss = `
.pay-page{
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;padding:40px 20px;
}
.pay-card{
  background:${T.card};border:1px solid ${T.border};
  border-radius:28px;padding:40px;max-width:480px;width:100%;
  backdrop-filter:blur(20px);position:relative;
  animation:payIn .6s cubic-bezier(.22,1,.36,1) forwards;
}
.pay-topline{
  position:absolute;top:0;right:0;left:0;height:3px;
  background:linear-gradient(90deg,transparent,${T.accent},${T.goldBright},${T.accent},transparent);
  border-radius:28px 28px 0 0;
}
.pay-header{text-align:center;margin-bottom:28px}
.pay-icon-ring{
  width:60px;height:60px;margin:0 auto 16px;border-radius:50%;
  background:linear-gradient(135deg,${T.accent}18,${T.gold}10);
  border:1.5px solid ${T.accent}30;
  display:flex;align-items:center;justify-content:center;
  color:${T.goldBright};
}
.pay-header h2{
  font-size:1.3rem;font-weight:800;color:${T.text};margin-bottom:6px;
}
.pay-header p{color:${T.textMuted};font-size:.9rem}
.pay-header strong{color:${T.goldBright}}
.pay-amount-box{
  background:linear-gradient(135deg,${T.accent}12,${T.gold}08);
  border:1.5px solid ${T.accent}25;border-radius:18px;
  padding:20px;text-align:center;margin-bottom:24px;
}
.pay-amount-label{
  font-size:.8rem;color:${T.textMuted};font-weight:500;
  display:block;margin-bottom:8px;
}
.pay-amount-val{
  font-size:1.8rem;font-weight:900;color:${T.goldBright};
  text-shadow:0 0 28px ${T.goldBright}25;
  display:flex;align-items:baseline;justify-content:center;gap:8px;
}
.pay-amount-unit{font-size:.8rem;font-weight:400;color:${T.textDim}}
.pay-field{
  background:${T.surface};border:1px solid ${T.border};
  border-radius:16px;padding:16px 18px;margin-bottom:12px;
}
.pay-field-label{
  font-size:.78rem;color:${T.textDim};font-weight:500;
  display:block;margin-bottom:8px;
}
.pay-field-row{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
.pay-field-value{
  font-size:.95rem;font-weight:700;color:${T.text};
  direction:ltr;text-align:left;letter-spacing:.05em;
  user-select:all;flex:1;
}
.pay-field-value.mono{
  font-family:'Courier New',monospace;font-weight:800;font-size:.95rem;
  color:${T.goldBright};
}
.pay-copy-btn{
  display:inline-flex;align-items:center;gap:6px;
  background:${T.accent}15;border:1px solid ${T.accent}25;
  color:${T.accent};border-radius:10px;
  padding:8px 14px;cursor:pointer;
  font-family:'Vazirmatn',sans-serif;font-size:.78rem;font-weight:600;
  transition:all .3s;flex-shrink:0;
}
.pay-copy-btn:hover{
  background:${T.accent}25;transform:translateY(-1px);
}
.pay-divider{
  height:1px;margin:20px 0;
  background:linear-gradient(90deg,transparent,${T.border},transparent);
}
.pay-info{
  display:flex;gap:12px;align-items:flex-start;
  background:${T.surface};border:1px solid ${T.border};
  border-radius:14px;padding:14px 18px;margin-bottom:24px;
  direction:rtl;
}
.pay-info-icon{font-size:1.2rem;flex-shrink:0;margin-top:2px}
.pay-info p{color:${T.textMuted};font-size:.84rem;line-height:1.8}
.pay-confirm-btn{
  width:100%;padding:17px 0;border:none;
  background:linear-gradient(135deg,${T.green},${T.greenDark});
  color:#fff;font-family:'Vazirmatn',sans-serif;
  font-size:1rem;font-weight:700;border-radius:16px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:10px;
  transition:all .35s cubic-bezier(.22,1,.36,1);
  box-shadow:0 8px 28px ${T.green}35,0 0 50px ${T.green}10;
}
.pay-confirm-btn:hover{
  transform:translateY(-3px);
  box-shadow:0 14px 40px ${T.green}45,0 0 70px ${T.green}15;
}
.pay-back-btn{
  width:100%;padding:14px 0;margin-top:12px;border:none;
  background:transparent;color:${T.textMuted};
  font-family:'Vazirmatn',sans-serif;font-size:.88rem;font-weight:500;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
  transition:all .3s;border-radius:14px;
  border:1px solid ${T.border};
}
.pay-back-btn:hover{color:${T.text};border-color:${T.textDim}}
@keyframes payIn{
  from{opacity:0;transform:scale(.92) translateY(20px)}
  to{opacity:1;transform:scale(1) translateY(0)}
}
`;

/* ═══════════════════════════════════════════
 *  Main CSS
 * ═══════════════════════════════════════════ */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap');

.c-pg *{margin:0;padding:0;box-sizing:border-box}
.c-pg{
  font-family:'Vazirmatn',sans-serif;direction:rtl;text-align:right;
  background:${T.bg};color:${T.text};min-height:100vh;overflow-x:hidden;position:relative;
}
.c-pg::before{
  content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(ellipse 900px 600px at 70% 3%,rgba(255,90,26,0.12)0%,transparent 100%),
    radial-gradient(ellipse 700px 700px at 25% 95%,rgba(232,72,0,0.07)0%,transparent 100%),
    radial-gradient(ellipse 500px 500px at 55% 50%,rgba(255,60,0,0.04)0%,transparent 100%);
  animation:bgB 12s ease-in-out infinite alternate;
}
.c-pg::after{
  content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E");
  opacity:.018;
}
.vg{position:fixed;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(ellipse at center,transparent 40%,${T.bgDeep} 100%);opacity:.45}
.ht{position:fixed;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(0deg,rgba(255,60,0,.03)0%,transparent 12%,transparent 88%,rgba(255,90,26,.02)100%);
  animation:hR 8s ease-in-out infinite alternate}
.orb{position:fixed;border-radius:50%;pointer-events:none;z-index:0;filter:blur(100px)}
.orb-a{width:380px;height:380px;background:rgba(255,90,26,.1);top:2%;right:-7%;
  animation:oD 14s ease-in-out infinite alternate}
.orb-b{width:300px;height:300px;background:rgba(232,72,0,.07);bottom:6%;left:-4%;
  animation:oD 18s ease-in-out 3s infinite alternate-reverse}

.c-wrap{position:relative;z-index:3;max-width:900px;margin:0 auto;padding:44px 28px 120px}

.c-hero{text-align:center;padding:48px 20px 36px}
.c-hb{
  display:inline-flex;align-items:center;gap:9px;
  background:linear-gradient(135deg,${T.accent}18,${T.gold}12);
  border:1px solid ${T.accent}28;backdrop-filter:blur(14px);
  color:${T.goldBright};font-weight:600;font-size:.76rem;letter-spacing:.04em;
  padding:9px 24px;border-radius:50px;margin-bottom:22px;
  animation:fd .7s cubic-bezier(.22,1,.36,1) forwards;
}
.c-hero h1{
  font-size:clamp(2rem,5vw,3rem);font-weight:900;line-height:1.1;
  margin-bottom:10px;letter-spacing:-0.025em;
  animation:fd .7s cubic-bezier(.22,1,.36,1) .06s forwards;opacity:0;
}
.c-hero h1 .hl{
  background:linear-gradient(135deg,${T.accentHot},${T.goldBright},${T.ember});
  background-size:300% 300%;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  animation:shm 6s ease-in-out infinite;
}
.c-hero-p{
  color:${T.textMuted};font-size:.95rem;font-weight:300;line-height:1.8;
  animation:fd .7s cubic-bezier(.22,1,.36,1) .12s forwards;opacity:0;
}
.c-back{
  display:inline-flex;align-items:center;gap:8px;
  color:${T.textMuted};font-size:.85rem;font-weight:500;
  text-decoration:none;margin-bottom:28px;
  transition:all .3s;animation:fu .5s cubic-bezier(.22,1,.36,1) .2s forwards;opacity:0;
}
.c-back:hover{color:${T.accent};gap:12px;transform:translateX(4px)}
.c-back svg{transition:transform .3s}
.c-back:hover svg{transform:translateX(4px)}

.c-layout{display:flex;gap:28px;align-items:flex-start}
@media(max-width:768px){.c-layout{flex-direction:column}}

.c-items{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;
  animation:fu .6s cubic-bezier(.22,1,.36,1) .28s forwards;opacity:0}

.c-item{
  background:${T.card};border:1px solid ${T.border};
  border-radius:${T.r};overflow:hidden;
  transition:all .4s cubic-bezier(.22,1,.36,1);
  position:relative;backdrop-filter:blur(14px);
  display:flex;align-items:center;gap:0;
}
.c-item::before{
  content:'';position:absolute;top:0;right:0;bottom:0;width:3px;
  background:linear-gradient(to bottom,${T.accent},${T.gold});
  opacity:0;transition:opacity .4s;border-radius:${T.r} 0 0 ${T.r};
}
.c-item:hover{
  border-color:${T.borderHov};transform:translateX(-4px);
  box-shadow:0 12px 40px ${T.shadow},0 4px 16px ${T.accent}08;
}
.c-item:hover::before{opacity:1}

.c-item-img{width:100px;height:100px;flex-shrink:0;overflow:hidden;position:relative}
.c-item-img img{width:100%;height:100%;object-fit:cover}
.c-item-img-ph{
  width:100%;height:100%;
  background:linear-gradient(145deg,${T.surface2},#110b08);
  display:flex;align-items:center;justify-content:center;font-size:2.5rem;
}

.c-item-info{flex:1;padding:18px 16px;min-width:0}
.c-item-name{
  font-size:1.05rem;font-weight:700;color:${T.text};
  margin-bottom:4px;line-height:1.5;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.c-item-unit{font-size:.78rem;color:${T.textDim}}
.c-item-price-row{display:flex;align-items:center;gap:8px;margin-top:6px}
.c-item-price{font-size:1.05rem;font-weight:800;color:${T.goldBright}}
.c-item-x{font-size:.75rem;color:${T.textDim}}
.c-item-subtotal{
  font-size:.92rem;font-weight:900;color:${T.goldBright};
  text-shadow:0 0 16px ${T.goldBright}18;
}

.c-qty{
  display:flex;align-items:center;gap:0;
  background:${T.surface};border:1px solid ${T.border};
  border-radius:14px;overflow:hidden;flex-shrink:0;margin:0 16px;
}
.c-qty button{
  width:40px;height:40px;border:none;background:none;
  color:${T.textMuted};cursor:pointer;display:flex;
  align-items:center;justify-content:center;
  transition:all .25s;font-family:'Vazirmatn',sans-serif;
}
.c-qty button:hover{color:${T.accent};background:${T.accent}10}
.c-qty button:active{transform:scale(.9)}
.c-qty-n{
  min-width:36px;text-align:center;font-weight:800;font-size:.95rem;
  color:${T.text};border-left:1px solid ${T.border};
  border-right:1px solid ${T.border};padding:8px 0;
}

.c-rm{
  width:40px;height:40px;border:none;background:none;
  color:${T.textDim};cursor:pointer;border-radius:12px;
  display:flex;align-items:center;justify-content:center;
  transition:all .3s;margin:0 16px 0 0;flex-shrink:0;
}
.c-rm:hover{color:${T.red};background:${T.red}12;transform:scale(1.1)}

.c-summ{
  width:360px;flex-shrink:0;position:sticky;top:28px;
  animation:fu .6s cubic-bezier(.22,1,.36,1) .35s forwards;opacity:0;
}
@media(max-width:768px){.c-summ{width:100%;position:static}}

.c-summ-card{
  background:${T.card};border:1px solid ${T.border};
  border-radius:${T.r};overflow:hidden;
  backdrop-filter:blur(16px);position:relative;
}
.c-summ-card::before{
  content:'';position:absolute;top:0;right:0;left:0;height:2px;
  background:linear-gradient(90deg,transparent 5%,${T.accent}40 25%,${T.goldBright}50 50%,${T.accent}40 75%,transparent 95%);
  filter:blur(.5px);
}

.c-summ-hd{padding:24px 24px 0;display:flex;align-items:center;gap:10px}
.c-summ-hd h2{font-size:1.12rem;font-weight:700;color:${T.text}}
.c-summ-hd svg{color:${T.goldBright}}

.c-summ-body{padding:20px 24px 24px}

.c-inp{position:relative;margin-bottom:16px}
.c-inp svg{
  position:absolute;top:50%;right:14px;transform:translateY(-50%);
  color:${T.textDim};transition:color .3s;pointer-events:none;
}
.c-inp input{
  width:100%;padding:14px 48px 14px 16px;
  background:${T.surface};border:1.5px solid ${T.border};
  border-radius:14px;color:${T.text};
  font-family:'Vazirmatn',sans-serif;font-size:.92rem;
  direction:rtl;text-align:right;
  transition:all .35s cubic-bezier(.22,1,.36,1);outline:none;
}
.c-inp input::placeholder{color:${T.textDim}}
.c-inp input:focus{
  border-color:${T.accent}55;
  box-shadow:0 0 0 4px ${T.accent}0a,0 8px 28px rgba(0,0,0,0.2);
}
.c-inp:focus-within svg{color:${T.accent}}

.c-div{height:1px;margin:20px 0;background:linear-gradient(90deg,transparent,${T.border},transparent)}

.c-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:.9rem}
.c-row-label{color:${T.textMuted}}
.c-row-val{color:${T.text};font-weight:600}
.c-row-val.accent{color:${T.accent};font-weight:800;font-size:1.1rem;text-shadow:0 0 20px ${T.accent}25}

.c-total{
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 0 0;margin-top:8px;border-top:2px solid ${T.border};
}
.c-total-label{font-size:1.05rem;font-weight:700;color:${T.text}}
.c-total-val{
  font-size:1.4rem;font-weight:900;color:${T.goldBright};
  text-shadow:0 0 28px ${T.goldBright}25;
  display:flex;align-items:baseline;gap:6px;
}
.c-total-unit{font-size:.72rem;font-weight:400;color:${T.textDim}}

.c-submit{
  width:100%;padding:17px 0;margin-top:24px;border:none;
  background:linear-gradient(135deg,${T.accent},${T.lava},${T.accentHot});
  background-size:200% 200%;background-position:0% 50%;
  color:#fff;font-family:'Vazirmatn',sans-serif;
  font-size:1rem;font-weight:700;border-radius:16px;cursor:pointer;
  transition:all .35s cubic-bezier(.22,1,.36,1);
  display:flex;align-items:center;justify-content:center;gap:10px;
  position:relative;overflow:hidden;
  box-shadow:0 8px 28px ${T.accent}35,0 0 50px ${T.accent}10;
}
.c-submit::before{
  content:'';position:absolute;top:0;left:-120%;width:60%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent);
  animation:cSh 3.5s ease-in-out infinite;
}
.c-submit:hover{
  transform:translateY(-3px);
  box-shadow:0 14px 40px ${T.accent}50,0 0 70px ${T.accent}18;
  background-position:100% 50%;
}
.c-submit:active{transform:translateY(0) scale(.98)}
.c-submit:disabled{opacity:.5;cursor:not-allowed;transform:none!important;box-shadow:none!important}

.c-empty{text-align:center;padding:100px 20px;
  animation:fu .6s cubic-bezier(.22,1,.36,1) .2s forwards;opacity:0}
.c-empty-ico{
  width:100px;height:100px;margin:0 auto 28px;border-radius:50%;
  background:linear-gradient(135deg,${T.accent}0d,${T.gold}08);
  border:1.5px solid ${T.border};
  display:flex;align-items:center;justify-content:center;
  animation:fl 4s ease-in-out infinite;
}
.c-empty-ico svg{color:${T.textDim};opacity:.35}
.c-empty h2{color:${T.textMuted};font-weight:600;font-size:1.3rem;margin-bottom:12px}
.c-empty p{color:${T.textDim};font-size:.9rem;margin-bottom:30px}

.c-empty-btn{
  display:inline-flex;align-items:center;gap:10px;
  background:linear-gradient(135deg,${T.accent},${T.lava});
  color:#fff;border:none;font-family:'Vazirmatn',sans-serif;
  font-size:.92rem;font-weight:700;
  padding:14px 32px;border-radius:50px;cursor:pointer;
  text-decoration:none;transition:all .35s cubic-bezier(.22,1,.36,1);
  box-shadow:0 8px 28px ${T.accent}35;
}
.c-empty-btn:hover{transform:translateY(-3px);box-shadow:0 14px 40px ${T.accent}50;color:#fff}

.c-success{
  position:fixed;inset:0;z-index:150;
  background:rgba(4,2,1,0.85);backdrop-filter:blur(16px);
  display:flex;align-items:center;justify-content:center;
  animation:fadeIn .4s ease forwards;
}
.c-success-card{
  background:${T.card};border:1px solid ${T.border};
  border-radius:28px;padding:48px;text-align:center;max-width:420px;
  backdrop-filter:blur(20px);position:relative;
  animation:sucIn .6s cubic-bezier(.22,1,.36,1) forwards;
}
.c-success-card::before{
  content:'';position:absolute;top:0;right:0;left:0;height:2px;
  background:linear-gradient(90deg,transparent,${T.green},${T.goldBright},transparent);
}
.c-success-ring{
  width:80px;height:80px;margin:0 auto 24px;border-radius:50%;
  background:linear-gradient(135deg,${T.green}20,${T.greenDark}15);
  border:2px solid ${T.green}40;
  display:flex;align-items:center;justify-content:center;
  animation:ringPop .6s cubic-bezier(.22,1,.36,1) .2s forwards;
  transform:scale(0);
}
.c-success-card h2{font-size:1.4rem;font-weight:800;margin-bottom:10px;color:${T.text}}
.c-success-card p{color:${T.textMuted};font-size:.92rem;line-height:1.8;margin-bottom:28px}
.c-success-id{
  display:inline-block;background:${T.surface};border:1px solid ${T.border};
  border-radius:12px;padding:10px 20px;
  font-size:1.1rem;font-weight:800;color:${T.goldBright};
  margin-bottom:28px;text-shadow:0 0 16px ${T.goldBright}20;
}
.c-success-btn{
  display:inline-flex;align-items:center;gap:8px;
  background:linear-gradient(135deg,${T.accent},${T.lava});
  color:#fff;border:none;font-family:'Vazirmatn',sans-serif;
  font-size:.92rem;font-weight:700;
  padding:14px 32px;border-radius:50px;cursor:pointer;
  text-decoration:none;transition:all .3s;
  box-shadow:0 8px 28px ${T.accent}35;
}
.c-success-btn:hover{transform:translateY(-2px);box-shadow:0 12px 36px ${T.accent}45;color:#fff}

@keyframes fd{from{opacity:0;transform:translateY(-22px)}to{opacity:1;transform:translateY(0)}}
@keyframes fu{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes shm{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes bgB{0%{opacity:1;filter:brightness(1)}100%{opacity:.8;filter:brightness(1.12)}}
@keyframes oD{0%{transform:translate(0,0) scale(1)}100%{transform:translate(30px,-20px) scale(1.1)}}
@keyframes hR{0%{transform:translateY(0)}100%{transform:translateY(-8px)}}
@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes cSh{0%,65%,100%{left:-120%}80%{left:160%}}
@keyframes tIn{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes sucIn{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes ringPop{from{transform:scale(0)}to{transform:scale(1)}}

@media(max-width:480px){
  .c-wrap{padding:24px 16px 100px}
  .c-item{flex-wrap:wrap}
  .c-item-img{width:80px;height:80px}
  .c-qty{margin:8px 12px}
  .c-rm{margin:8px 12px 8px 0}
}
`;

/* ═══════════════════════════════════════════
 *  CartItemRow
 * ═══════════════════════════════════════════ */
const emojis = [
  '🍔', '🍕', '🌮', '🍟', '🍗', '🥩', '🥗', '🌯', '🌭', '🥪',
  '🍜', '🍝', '🍛', '🍱', '🥘', '🧆', '🥙', '🫓', '🥟', '🍔',
];

function CartItemRow({ item, onInc, onDec, onRem, idx }) {
  const price = Number(item.final_price || item.price || 0);
  const subtotal = price * item.quantity;
  const emoji = emojis[(item.id || 0) % emojis.length];

  return (
    <div className="c-item" style={{ animationDelay: `${0.3 + idx * 0.08}s` }}>
      <div className="c-item-img">
        {item.image ? (
          <img src={item.image} alt={item.name} />
        ) : (
          <div className="c-item-img-ph">{emoji}</div>
        )}
      </div>
      <div className="c-item-info">
        <div className="c-item-name">{item.name}</div>
        <div className="c-item-unit">{price.toLocaleString('fa-IR')} تومان</div>
        <div className="c-item-price-row">
          <span className="c-item-x">{item.quantity}×</span>
          <span className="c-item-subtotal">
            {subtotal.toLocaleString('fa-IR')} تومان
          </span>
        </div>
      </div>
      <div className="c-qty">
        <button onClick={() => onDec(item)} title="کاهش">
          <MinusSVG />
        </button>
        <span className="c-qty-n">{item.quantity}</span>
        <button onClick={() => onInc(item)} title="افزایش">
          <PlusSVG />
        </button>
      </div>
      <button className="c-rm" onClick={() => onRem(item)} title="حذف">
        <TrashSVG />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════
 *  Cart (Main)
 * ═══════════════════════════════════════════ */
function Cart({ cart, onIncrease, onDecrease, onRemove, onClearCart }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(null);
  const [toast, setToast] = useState(null);
  const [payment, setPayment] = useState(null);

  const total = useMemo(
    () => cart.reduce((s, it) => s + Number(it.final_price || it.price || 0) * it.quantity, 0),
    [cart]
  );

  const handleOrder = async () => {
    if (!name.trim()) {
      setToast({ message: 'نام خود را وارد کنید', type: 'error' });
      return;
    }
    if (!phone.trim()) {
      setToast({ message: 'شماره تلفن را وارد کنید', type: 'error' });
      return;
    }

    setSending(true);
    try {
      const csrfToken = getCookie('csrftoken');
      const res = await axios.post(
        `${API}/api/orders/`,
        {
          customer_name: name.trim(),
          phone: phone.trim(),
          total_price: total,
          items: cart.map((it) => ({
            food: it.id,
            quantity: it.quantity,
            price: Number(it.final_price || it.price || 0),
          })),
        },
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
          },
        }
      );

      setPayment({ id: res.data.id, total, name: name.trim() });
      onClearCart();
    } catch (err) {
      console.error(err);
      setToast({ message: 'خطا در ثبت سفارش. دوباره تلاش کنید', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const handlePaymentConfirm = () => {
    setSuccess({ id: payment.id, total: payment.total });
    setPayment(null);
  };

  /* ── Payment ── */
  if (payment) {
    return (
      <div className="c-pg">
        <style>{css}</style>
        <Embers />
        <div className="vg" />
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <PaymentPage
          orderId={payment.id}
          total={payment.total}
          customerName={payment.name}
          onConfirm={handlePaymentConfirm}
        />
      </div>
    );
  }

  /* ── Empty ── */
  if (cart.length === 0 && !success) {
    return (
      <div className="c-pg">
        <style>{css}</style>
        <Embers />
        <div className="vg" />
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="c-wrap">
          <div className="c-empty">
            <div className="c-empty-ico">
              <CartSVG size={40} />
            </div>
            <h2>سبد خرید شما خالی است</h2>
            <p>از منوی ما دیدن کنید و غذای مورد علاقه‌تان را انتخاب کنید</p>
            <Link to="/menu" className="c-empty-btn">
              <MenuSVG /> مشاهده منو
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Success ── */
  if (success) {
    return (
      <div className="c-pg">
        <style>{css}</style>
        <Embers />
        <div className="vg" />
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="c-success">
          <div className="c-success-card">
            <div className="c-success-ring">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#34d365"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2>سفارش شما ثبت شد!</h2>
            <p>سفارش شما با موفقیت ثبت و در صف آماده‌سازی قرار گرفت</p>
            <div className="c-success-id">شماره سفارش: #{success.id}</div>
            <br />
            <Link to="/menu" className="c-success-btn">
              <ArrowSVG /> بازگشت به منو
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Cart View ── */
  return (
    <div className="c-pg">
      <style>{css}</style>
      <Embers />
      <div className="vg" />
      <div className="ht" />
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="c-wrap">
        <div className="c-hero">
          <div className="c-hb">
            <FireSVG /> سفارش شما
          </div>
          <h1>
            سبد <span className="hl">خرید</span>
          </h1>
          <p className="c-hero-p">{cart.length} آیتم در سبد شما منتظر ثبت سفارش است</p>
        </div>

        <Link to="/menu" className="c-back">
          <ArrowSVG /> بازگشت به منو
        </Link>

        <div className="c-layout">
          <div className="c-items">
            {cart.map((item, i) => (
              <CartItemRow
                key={item.id}
                item={item}
                idx={i}
                onInc={onIncrease}
                onDec={onDecrease}
                onRem={onRemove}
              />
            ))}
          </div>

          <div className="c-summ">
            <div className="c-summ-card">
              <div className="c-summ-hd">
                <ReceiptSVG />
                <h2>خلاصه سفارش</h2>
              </div>
              <div className="c-summ-body">
                <div className="c-inp">
                  <UserSVG />
                  <input
                    type="text"
                    placeholder="نام و نام خانوادگی"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="c-inp">
                  <PhoneSVG />
                  <input
                    type="tel"
                    placeholder="شماره تلفن"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={11}
                  />
                </div>
                <div className="c-div" />
                <div className="c-row">
                  <span className="c-row-label">تعداد آیتم‌ها</span>
                  <span className="c-row-val">
                    {cart.reduce((s, it) => s + it.quantity, 0)}
                  </span>
                </div>
                <div className="c-row">
                  <span className="c-row-label">هزینه ارسال</span>
                  <span className="c-row-val accent">رایگان</span>
                </div>
                <div className="c-total">
                  <span className="c-total-label">جمع کل</span>
                  <span className="c-total-val">
                    {total.toLocaleString('fa-IR')}
                    <span className="c-total-unit">تومان</span>
                  </span>
                </div>
                <button
                  className="c-submit"
                  onClick={handleOrder}
                  disabled={sending || cart.length === 0}
                >
                  {sending ? (
                    <>در حال ثبت...</>
                  ) : (
                    <>
                      <FireSVG /> ثبت سفارش و پرداخت
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Cart;