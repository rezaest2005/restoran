import { useId, useMemo } from "react";
import { Box } from "@mui/material";

/**
 * Isometric (3D-looking) scene for the sign-in card, drawn in code with the design tokens, so it follows
 * light/dark mode and never needs an image file. It shows what the product is about:
 * warehouse stock, a point-of-sale terminal, a delivery truck and a growth chart on one platform.
 */

const S = 24;                       // pixels per unit
const COS = 0.8660254;
const SIN = 0.5;
const proj = (x, y, z) => [(x - y) * COS * S, (x + y) * SIN * S - z * S];

const mix = (c, withColor, pct) => `color-mix(in srgb, ${c} ${100 - pct}%, ${withColor} ${pct}%)`;
const shades = (c) => ({ top: mix(c, "white", 22), left: c, right: mix(c, "black", 24) });

/** One box: three visible faces (top, left, right). Optional `screen` draws an inset panel on the left face. */
function cube({ x, y, z, w, d, h, color, screen, stripe, windowRight, key }) {
  const sh = shades(color);
  const P = (px, py, pz) => proj(px, py, pz);
  const pts = (arr) => arr.map((p) => p.join(",")).join(" ");
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const left = [P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)];
  const right = [P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)];
  const onLeft = (u, v) => P(x + u * w, y + d, z + v * h);
  const onRight = (u, v) => P(x + w, y + u * d, z + v * h);
  const all = [...top, ...left, ...right];
  const node = (
    <g key={key}>
      <polygon points={pts(left)} fill={sh.left} />
      <polygon points={pts(right)} fill={sh.right} />
      <polygon points={pts(top)} fill={sh.top} />
      {stripe && (
        <polygon
          points={pts([onLeft(0, stripe[0]), onLeft(1, stripe[0]), onLeft(1, stripe[1]), onLeft(0, stripe[1])])}
          fill={stripe[2]}
        />
      )}
      {stripe && (
        <polygon
          points={pts([onRight(0, stripe[0]), onRight(1, stripe[0]), onRight(1, stripe[1]), onRight(0, stripe[1])])}
          fill={mix(stripe[2], "black", 24)}
        />
      )}
      {windowRight && (
        <polygon
          points={pts([onRight(0.12, 0.5), onRight(0.88, 0.5), onRight(0.88, 0.88), onRight(0.12, 0.88)])}
          fill="color-mix(in srgb, white 78%, var(--ink))"
        />
      )}
      {screen && (
        <g>
          <polygon points={pts([onLeft(0.1, 0.12), onLeft(0.9, 0.12), onLeft(0.9, 0.88), onLeft(0.1, 0.88)])} fill="var(--surface)" />
          {[0.3, 0.5, 0.7].map((v, i) => (
            <polygon
              key={i}
              points={pts([onLeft(0.18, v - 0.06), onLeft(0.18 + 0.5 - i * 0.1, v - 0.06), onLeft(0.18 + 0.5 - i * 0.1, v + 0.06), onLeft(0.18, v + 0.06)])}
              fill={i === 1 ? "var(--accent)" : "var(--line-strong)"}
            />
          ))}
        </g>
      )}
    </g>
  );
  return { node, pts: all, order: x + w / 2 + (y + d / 2) + z };
}

export default function LoginHero({ width = 330 }) {
  const uid = useId().replace(/:/g, "");

  const { items, box } = useMemo(() => {
    const defs = [
      // platform
      { key: "base", x: 0, y: 0, z: 0, w: 11, d: 9, h: 0.5, color: "color-mix(in srgb, var(--primary) 26%, var(--surface))" },
      // warehouse stack (inventory)
      { key: "w1", x: 0.8, y: 1, z: 0.5, w: 2.4, d: 2.4, h: 1.5, color: "var(--accent)", stripe: [0.42, 0.58, "var(--surface)"] },
      { key: "w2", x: 0.95, y: 1.15, z: 2, w: 2.1, d: 2.1, h: 1.3, color: "var(--primary)", stripe: [0.42, 0.58, "var(--surface)"] },
      { key: "w3", x: 3.5, y: 1.2, z: 0.5, w: 1.8, d: 1.8, h: 1.1, color: "var(--primary)", stripe: [0.42, 0.58, "var(--surface)"] },
      // point of sale terminal
      { key: "pos0", x: 4.2, y: 5.4, z: 0.5, w: 3, d: 2.2, h: 0.6, color: "color-mix(in srgb, var(--ink) 55%, var(--surface))" },
      { key: "pos1", x: 4.4, y: 5.5, z: 1.1, w: 2.6, d: 0.45, h: 2.1, color: "color-mix(in srgb, var(--ink) 82%, var(--primary))", screen: true },
      // delivery truck: cargo box, cab, wheels
      { key: "tr1", x: 6.6, y: 0.7, z: 1.0, w: 3.1, d: 1.9, h: 1.9, color: "color-mix(in srgb, white 90%, var(--primary) 10%)", stripe: [0.4, 0.62, "var(--primary)"] },
      { key: "tr2", x: 9.7, y: 0.7, z: 1.0, w: 1.0, d: 1.9, h: 1.2, color: "var(--accent)", windowRight: true },
      { key: "wh1", x: 7.1, y: 2.5, z: 0.5, w: 0.9, d: 0.4, h: 0.85, color: "var(--ink)" },
      { key: "wh2", x: 9.6, y: 2.5, z: 0.5, w: 0.9, d: 0.4, h: 0.85, color: "var(--ink)" },
    ];
    const built = defs.map((d) => cube(d));
    // growth chart bars, drawn separately so they can float
    const bars = [1.2, 2.0, 3.0].map((h, i) =>
      cube({ key: `bar${i}`, x: 0.9 + i * 1.0, y: 5.6, z: 0.5, w: 0.8, d: 0.8, h, color: i === 2 ? "var(--accent)" : "var(--primary)" }),
    );
    const everything = [...built, ...bars];
    const xs = everything.flatMap((c) => c.pts.map((p) => p[0]));
    const ys = everything.flatMap((c) => c.pts.map((p) => p[1]));
    const pad = 14;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return {
      items: { built: built.sort((a, b) => a.order - b.order), bars: bars.sort((a, b) => a.order - b.order) },
      box: [minX, minY, Math.max(...xs) - minX + pad, Math.max(...ys) - minY + pad + 18],
    };
  }, []);

  return (
    <Box
      aria-hidden="true"
      sx={{
        width, maxWidth: "100%", mx: "auto",
        "& svg": { width: "100%", height: "auto", display: "block", overflow: "visible" },
        [`& .scene-${uid}`]: { animation: `heroFloat${uid} 7s ease-in-out infinite` },
        [`& .bars-${uid}`]: { animation: `heroBars${uid} 5s ease-in-out infinite` },
        [`@keyframes heroFloat${uid}`]: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-5px)" } },
        [`@keyframes heroBars${uid}`]: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-7px)" } },
        "@media (prefers-reduced-motion: reduce)": { [`& .scene-${uid}, & .bars-${uid}`]: { animation: "none" } },
      }}
    >
      <svg viewBox={box.join(" ")} role="presentation" focusable="false">
        <defs>
          <filter id={`blur${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <ellipse
          cx={box[0] + box[2] / 2} cy={box[1] + box[3] - 14} rx={box[2] * 0.42} ry={box[3] * 0.07}
          fill="var(--ink)" opacity="0.16" filter={`url(#blur${uid})`}
        />
        <g className={`scene-${uid}`}>
          {items.built.map((c) => c.node)}
          <g className={`bars-${uid}`}>{items.bars.map((c) => c.node)}</g>
        </g>
      </svg>
    </Box>
  );
}
