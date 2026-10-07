"use client";

import { useState } from "react";

export interface WeekPoint {
  week: string;
  label: string;
  leads: number;
  hired: number;
  spend: number | null;
}

const W = 600, H = 220, PAD = { top: 12, right: 8, bottom: 28, left: 32 };
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function niceMax(n: number) {
  const step = n <= 20 ? 5 : n <= 50 ? 10 : 20;
  return Math.max(step, Math.ceil(n / step) * step);
}

/** New leads per week, one bar per week, with a hover tooltip. */
export default function WeeklyChart({ data }: { data: WeekPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.leads), 1));
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.min(36, slot - 2); // 2px gap between bars at minimum
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const h = hover === null ? null : data[hover];

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="New leads per week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const top = y(d.leads), bottom = y(0), r = Math.min(4, (bottom - top) / 2);
          const x0 = cx - barW / 2, x1 = cx + barW / 2;
          return (
            <g key={d.week}>
              {d.leads > 0 && (
                <path
                  d={`M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${bottom} Z`}
                  fill="var(--series-1)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {(i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle">{d.label}</text>
              )}
              {/* Hit target: the whole column, wider than the bar. */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="tooltip" style={{
          left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
          top: `${(y(h.leads) / H) * 100}%`,
        }}>
          <div><b>Week of {h.label}</b></div>
          <div>{h.leads} new leads · {h.hired} hired that week</div>
          <div>Ad spend {h.spend === null ? "not entered" : usd(h.spend)}
            {h.spend !== null && h.leads > 0 && ` · ${usd(h.spend / h.leads)}/lead`}</div>
        </div>
      )}
    </div>
  );
}
