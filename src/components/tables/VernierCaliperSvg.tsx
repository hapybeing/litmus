import React, { useCallback, useMemo, useRef, useState } from 'react';
import type {
  GrimmerResult,
  GrimResult,
  MeanLatticePoint,
  SdLatticePoint,
  TableRowAudit,
} from '../../types/forensics';

const SVG_W = 560;
const SVG_H = 114;
const PAD_L = 34;
const PAD_R = 34;
const AXIS_Y = 58;
const PLOT_W = SVG_W - PAD_L - PAD_R;

interface MeanCaliperStaticProps {
  grim: GrimResult;
  minVal: number;
  maxVal: number;
}

const MeanCaliperStatic = React.memo(function MeanCaliperStatic({
  grim,
  minVal,
  maxVal,
}: MeanCaliperStaticProps) {
  const span = Math.max(1e-9, maxVal - minVal);
  const toX = (v: number) => PAD_L + ((v - minVal) / span) * PLOT_W;

  const repX = toX(grim.reportedMean);
  const winLoX = Math.max(PAD_L, toX(grim.windowLow));
  const winHiX = Math.min(SVG_W - PAD_R, toX(grim.windowHigh));
  const winW = Math.max(2, winHiX - winLoX);

  const isPass = grim.consistent;
  const bandFill = !grim.applicable
    ? 'rgba(92, 88, 80, 0.10)'
    : isPass
      ? 'rgba(22, 101, 52, 0.13)'
      : 'rgba(198, 40, 40, 0.14)';
  const bandStroke = !grim.applicable
    ? '#7C766B'
    : isPass
      ? '#166534'
      : '#C62828';

  // Choose label stride so tick annotations never collide
  const pts = grim.nearestPossibleMeans;
  const minTickPx = pts.length > 1 ? Math.abs(toX(pts[1].mean) - toX(pts[0].mean)) : PLOT_W;
  const labelStride = minTickPx < 46 ? 2 : 1;

  return (
    <g>
      {/* Subtle architectural guide rails */}
      <line x1={PAD_L} y1={AXIS_Y - 26} x2={SVG_W - PAD_R} y2={AXIS_Y - 26} stroke="#ECE8DE" strokeWidth="1" />
      <line x1={PAD_L} y1={AXIS_Y + 22} x2={SVG_W - PAD_R} y2={AXIS_Y + 22} stroke="#ECE8DE" strokeWidth="1" />

      {/* Rounding acceptance window */}
      <rect
        x={winLoX}
        y={AXIS_Y - 26}
        width={winW}
        height={48}
        fill={bandFill}
      />
      <line x1={winLoX} y1={AXIS_Y - 26} x2={winLoX} y2={AXIS_Y + 22} stroke={bandStroke} strokeWidth="1" strokeDasharray="2 2" />
      <line x1={winHiX} y1={AXIS_Y - 26} x2={winHiX} y2={AXIS_Y + 22} stroke={bandStroke} strokeWidth="1" strokeDasharray="2 2" />

      {/* Primary micrometer axis */}
      <line x1={PAD_L - 8} y1={AXIS_Y} x2={SVG_W - PAD_R + 8} y2={AXIS_Y} stroke="#141412" strokeWidth="1.2" />
      <line x1={PAD_L - 8} y1={AXIS_Y - 4} x2={PAD_L - 8} y2={AXIS_Y + 4} stroke="#141412" strokeWidth="1" />
      <line x1={SVG_W - PAD_R + 8} y1={AXIS_Y - 4} x2={SVG_W - PAD_R + 8} y2={AXIS_Y + 4} stroke="#141412" strokeWidth="1" />

      {/* Possible integer-sum lattice ticks */}
      {pts.map((pt, idx) => {
        const x = toX(pt.mean);
        if (x < PAD_L - 2 || x > SVG_W - PAD_R + 2) return null;
        const isMatch = pt.isMatch && grim.applicable;
        const showLabel = isMatch || idx % labelStride === 0;
        const tickTop = isMatch ? AXIS_Y - 21 : AXIS_Y - 15;
        const tickBot = isMatch ? AXIS_Y + 17 : AXIS_Y + 12;

        return (
          <g key={pt.sum}>
            <line
              x1={x}
              y1={tickTop}
              x2={x}
              y2={tickBot}
              stroke={isMatch ? '#166534' : '#141412'}
              strokeWidth={isMatch ? '2' : '1.15'}
            />
            {isMatch && (
              <circle cx={x} cy={AXIS_Y} r="3.2" fill="#166534" />
            )}
            {showLabel && (
              <>
                <text
                  x={x}
                  y={AXIS_Y + 35}
                  textAnchor="middle"
                  fill={isMatch ? '#166534' : '#5C5850'}
                  fontSize="9.5"
                  fontWeight={isMatch ? '600' : '400'}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {pt.formatted}
                </text>
                <text
                  x={x}
                  y={AXIS_Y + 47}
                  textAnchor="middle"
                  fill="#7C766B"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  S={pt.sum}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Reported Mean Needle */}
      <g>
        <line
          x1={repX}
          y1={AXIS_Y - 34}
          x2={repX}
          y2={AXIS_Y + 24}
          stroke={bandStroke}
          strokeWidth="1.4"
        />
        <polygon
          points={`${repX},${AXIS_Y - 28} ${repX - 4.5},${AXIS_Y - 35} ${repX + 4.5},${AXIS_Y - 35}`}
          fill={bandStroke}
        />
        <text
          x={repX}
          y={15}
          textAnchor="middle"
          fill={bandStroke}
          fontSize="9.5"
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          REPORTED M = {grim.reportedMean.toFixed(grim.decimals)}
        </text>
      </g>
    </g>
  );
});

interface MeanVernierAxisProps {
  grim: GrimResult;
}

function MeanVernierAxis({ grim }: MeanVernierAxisProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const probeGroupRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const pts = grim.nearestPossibleMeans;

  const { minVal, maxVal } = useMemo(() => {
    if (pts.length === 0) {
      return { minVal: grim.reportedMean - 0.1, maxVal: grim.reportedMean + 0.1 };
    }
    const lo = Math.min(pts[0].mean, grim.windowLow);
    const hi = Math.max(pts[pts.length - 1].mean, grim.windowHigh);
    const pad = Math.max((hi - lo) * 0.08, 1e-4);
    return { minVal: lo - pad, maxVal: hi + pad };
  }, [pts, grim.reportedMean, grim.windowLow, grim.windowHigh]);

  const span = Math.max(1e-9, maxVal - minVal);
  const toX = useCallback((v: number) => PAD_L + ((v - minVal) / span) * PLOT_W, [minVal, span]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (pts.length === 0 || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * SVG_W;

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.abs(toX(pts[i].mean) - relX);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        const snappedX = toX(pts[bestIdx].mean);
        if (probeGroupRef.current) {
          probeGroupRef.current.style.opacity = '1';
          probeGroupRef.current.setAttribute('transform', `translate(${snappedX}, 0)`);
        }
        setHoveredIdx((prev) => (prev === bestIdx ? prev : bestIdx));
      });
    },
    [pts, toX]
  );

  const handlePointerLeave = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (probeGroupRef.current) {
      probeGroupRef.current.style.opacity = '0';
    }
    setHoveredIdx(null);
  }, []);

  const defaultPoint: MeanLatticePoint | null = useMemo(() => {
    if (pts.length === 0) return null;
    return pts.reduce((best, p) => (Math.abs(p.delta) < Math.abs(best.delta) ? p : best), pts[0]);
  }, [pts]);

  const activePoint = hoveredIdx !== null && pts[hoveredIdx] ? pts[hoveredIdx] : defaultPoint;

  return (
    <section
      style={{
        backgroundColor: 'var(--bg-folio)',
        border: '1px solid var(--rule-hairline)',
        borderRadius: '2px',
      }}
    >
      <div
        className="px-3.5 py-2 flex items-center justify-between gap-2"
        style={{
          borderBottom: '1px solid var(--rule-hairline)',
          backgroundColor: 'var(--bg-ground)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono-num text-[10px] font-semibold" style={{ color: 'var(--ink-cobalt)' }}>
            01
          </span>
          <span className="micro-label truncate" style={{ color: 'var(--ink-primary)' }}>
            GRIM Mean Granularity Caliper
          </span>
        </div>
        <span className="mono-num text-[10.5px] whitespace-nowrap shrink-0" style={{ color: 'var(--ink-slate)' }}>
          N_eff = {grim.nEff} · [{grim.windowLow.toFixed(grim.decimals + 1)}, {grim.windowHigh.toFixed(grim.decimals + 1)}]
        </span>
      </div>

      <div className="px-2 pt-1.5 pb-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto block cursor-crosshair select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          role="img"
          aria-label={`GRIM Mean granularity lattice centered at ${grim.reportedMean.toFixed(grim.decimals)}`}
          data-testid="grim-caliper-svg"
        >
          <MeanCaliperStatic grim={grim} minVal={minVal} maxVal={maxVal} />
          {/* 60 FPS GPU-composited Blueprint Cobalt probe */}
          <g
            ref={probeGroupRef}
            style={{ opacity: 0, pointerEvents: 'none', transition: 'opacity 100ms linear' }}
          >
            <line
              x1={0}
              y1={20}
              x2={0}
              y2={AXIS_Y + 24}
              stroke="#1D4ED8"
              strokeWidth="1.4"
            />
            <circle cx={0} cy={AXIS_Y} r="4.5" fill="none" stroke="#1D4ED8" strokeWidth="1.6" />
          </g>
        </svg>
      </div>

      {/* Fixed-height tabular telemetry readout bar (zero layout jitter) */}
      <div
        className="px-3.5 py-1.5 flex items-center justify-between gap-2 mono-num text-[10.5px]"
        style={{
          borderTop: '1px solid var(--rule-hairline)',
          backgroundColor: hoveredIdx !== null ? 'var(--tint-cobalt)' : 'var(--bg-folio)',
          color: hoveredIdx !== null ? 'var(--ink-cobalt)' : 'var(--ink-slate)',
        }}
      >
        {activePoint ? (
          <>
            <span className="truncate">
              {hoveredIdx !== null ? 'PROBE' : 'NEAREST'} · S = {activePoint.sum} · Exact M ={' '}
              {activePoint.mean.toFixed(Math.max(4, grim.decimals + 2))} (→ {activePoint.formatted})
            </span>
            <span className="whitespace-nowrap shrink-0">
              Δ = {activePoint.delta >= 0 ? '+' : ''}
              {activePoint.delta.toFixed(Math.max(4, grim.decimals + 2))}
            </span>
          </>
        ) : (
          <span>Enter valid Mean and N ≥ 1 to compute integer lattice.</span>
        )}
      </div>
    </section>
  );
}

const SD_SVG_H = 128;

interface SdCaliperStaticProps {
  grimmer: GrimmerResult;
  minVal: number;
  maxVal: number;
}

const SdCaliperStatic = React.memo(function SdCaliperStatic({
  grimmer,
  minVal,
  maxVal,
}: SdCaliperStaticProps) {
  const span = Math.max(1e-9, maxVal - minVal);
  const toX = (v: number) => PAD_L + ((v - minVal) / span) * PLOT_W;

  const repX = toX(grimmer.reportedSd);
  const winLoX = Math.max(PAD_L, toX(grimmer.sdWindowLow));
  const winHiX = Math.min(SVG_W - PAD_R, toX(grimmer.sdWindowHigh));
  const winW = Math.max(2, winHiX - winLoX);

  const isPass = grimmer.consistent;
  const bandFill = isPass ? 'rgba(22, 101, 52, 0.13)' : 'rgba(198, 40, 40, 0.14)';
  const bandStroke = isPass ? '#166534' : '#C62828';

  const pts = grimmer.nearestPossibleSDs;
  const validPts = pts.filter((p) => p.parityValid);
  const minValidPx =
    validPts.length > 1 ? Math.abs(toX(validPts[1].sd) - toX(validPts[0].sd)) : PLOT_W;
  const validStride = minValidPx < 52 ? 2 : 1;

  let validCounter = 0;

  return (
    <g>
      <line x1={PAD_L} y1={AXIS_Y - 26} x2={SVG_W - PAD_R} y2={AXIS_Y - 26} stroke="#ECE8DE" strokeWidth="1" />
      <line x1={PAD_L} y1={AXIS_Y + 22} x2={SVG_W - PAD_R} y2={AXIS_Y + 22} stroke="#ECE8DE" strokeWidth="1" />

      {/* SD rounding acceptance window */}
      <rect x={winLoX} y={AXIS_Y - 26} width={winW} height={48} fill={bandFill} />
      <line x1={winLoX} y1={AXIS_Y - 26} x2={winLoX} y2={AXIS_Y + 22} stroke={bandStroke} strokeWidth="1" strokeDasharray="2 2" />
      <line x1={winHiX} y1={AXIS_Y - 26} x2={winHiX} y2={AXIS_Y + 22} stroke={bandStroke} strokeWidth="1" strokeDasharray="2 2" />

      {/* Axis baseline */}
      <line x1={PAD_L - 8} y1={AXIS_Y} x2={SVG_W - PAD_R + 8} y2={AXIS_Y} stroke="#141412" strokeWidth="1.2" />
      <line x1={PAD_L - 8} y1={AXIS_Y - 4} x2={PAD_L - 8} y2={AXIS_Y + 4} stroke="#141412" strokeWidth="1" />
      <line x1={SVG_W - PAD_R + 8} y1={AXIS_Y - 4} x2={SVG_W - PAD_R + 8} y2={AXIS_Y + 4} stroke="#141412" strokeWidth="1" />

      {/* Parity-valid solid ticks vs parity-forbidden ghost ticks */}
      {pts.map((pt) => {
        const x = toX(pt.sd);
        if (x < PAD_L - 2 || x > SVG_W - PAD_R + 2) return null;

        if (!pt.parityValid) {
          const isGhostTrap = pt.isWithinWindow;
          return (
            <g key={pt.q}>
              <line
                x1={x}
                y1={isGhostTrap ? AXIS_Y - 14 : AXIS_Y - 9}
                x2={x}
                y2={isGhostTrap ? AXIS_Y + 12 : AXIS_Y + 8}
                stroke={isGhostTrap ? '#C62828' : '#9B9488'}
                strokeWidth={isGhostTrap ? '1.3' : '1'}
                strokeDasharray="2 2"
              />
              {isGhostTrap && (
                <>
                  <circle
                    cx={x}
                    cy={AXIS_Y}
                    r="3.2"
                    fill="#FAF8F4"
                    stroke="#C62828"
                    strokeWidth="1.2"
                  />
                  <line
                    x1={x}
                    y1={AXIS_Y + 14}
                    x2={x}
                    y2={AXIS_Y + 53}
                    stroke="#C62828"
                    strokeWidth="0.9"
                    strokeDasharray="1.5 2"
                  />
                  <text
                    x={x}
                    y={AXIS_Y + 63}
                    textAnchor="middle"
                    fill="#C62828"
                    fontSize="8.5"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ✕ PARITY FORBIDDEN: Q={pt.q} ({pt.parity})
                  </text>
                </>
              )}
            </g>
          );
        }

        const idx = validCounter++;
        const isMatch = pt.isMatch;
        const showLabel = isMatch || idx % validStride === 0;

        return (
          <g key={pt.q}>
            <line
              x1={x}
              y1={isMatch ? AXIS_Y - 21 : AXIS_Y - 16}
              x2={x}
              y2={isMatch ? AXIS_Y + 17 : AXIS_Y + 12}
              stroke={isMatch ? '#166534' : '#141412'}
              strokeWidth={isMatch ? '2' : '1.25'}
            />
            {isMatch && <circle cx={x} cy={AXIS_Y} r="3.2" fill="#166534" />}
            {showLabel && (
              <>
                <text
                  x={x}
                  y={AXIS_Y + 34}
                  textAnchor="middle"
                  fill={isMatch ? '#166534' : '#5C5850'}
                  fontSize="9.5"
                  fontWeight={isMatch ? '600' : '400'}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {pt.formatted}
                </text>
                <text
                  x={x}
                  y={AXIS_Y + 45}
                  textAnchor="middle"
                  fill="#7C766B"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  Q={pt.q}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Reported SD Needle */}
      <g>
        <line
          x1={repX}
          y1={AXIS_Y - 34}
          x2={repX}
          y2={AXIS_Y + 24}
          stroke={bandStroke}
          strokeWidth="1.4"
        />
        <polygon
          points={`${repX},${AXIS_Y - 28} ${repX - 4.5},${AXIS_Y - 35} ${repX + 4.5},${AXIS_Y - 35}`}
          fill={bandStroke}
        />
        <text
          x={repX}
          y={15}
          textAnchor="middle"
          fill={bandStroke}
          fontSize="9.5"
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          REPORTED SD = {grimmer.reportedSd.toFixed(grimmer.sdDecimals)}
        </text>
      </g>
    </g>
  );
});

interface SdVernierAxisProps {
  grimmer: GrimmerResult;
}

function SdVernierAxis({ grimmer }: SdVernierAxisProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const probeGroupRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const pts = grimmer.nearestPossibleSDs;

  const { minVal, maxVal } = useMemo(() => {
    if (pts.length === 0) {
      return { minVal: Math.max(0, grimmer.reportedSd - 0.1), maxVal: grimmer.reportedSd + 0.1 };
    }
    const lo = Math.min(pts[0].sd, grimmer.sdWindowLow);
    const hi = Math.max(pts[pts.length - 1].sd, grimmer.sdWindowHigh);
    const pad = Math.max((hi - lo) * 0.08, 1e-4);
    return { minVal: Math.max(0, lo - pad), maxVal: hi + pad };
  }, [pts, grimmer.reportedSd, grimmer.sdWindowLow, grimmer.sdWindowHigh]);

  const span = Math.max(1e-9, maxVal - minVal);
  const toX = useCallback((v: number) => PAD_L + ((v - minVal) / span) * PLOT_W, [minVal, span]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (pts.length === 0 || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * SVG_W;

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.abs(toX(pts[i].sd) - relX);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        const snappedX = toX(pts[bestIdx].sd);
        if (probeGroupRef.current) {
          probeGroupRef.current.style.opacity = '1';
          probeGroupRef.current.setAttribute('transform', `translate(${snappedX}, 0)`);
        }
        setHoveredIdx((prev) => (prev === bestIdx ? prev : bestIdx));
      });
    },
    [pts, toX]
  );

  const handlePointerLeave = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (probeGroupRef.current) {
      probeGroupRef.current.style.opacity = '0';
    }
    setHoveredIdx(null);
  }, []);

  const defaultPoint: SdLatticePoint | null = useMemo(() => {
    const valid = pts.filter((p) => p.parityValid);
    if (valid.length === 0) return pts[0] ?? null;
    return valid.reduce((best, p) => (Math.abs(p.delta) < Math.abs(best.delta) ? p : best), valid[0]);
  }, [pts]);

  const activePoint = hoveredIdx !== null && pts[hoveredIdx] ? pts[hoveredIdx] : defaultPoint;

  return (
    <section
      style={{
        backgroundColor: 'var(--bg-folio)',
        border: '1px solid var(--rule-hairline)',
        borderRadius: '2px',
      }}
    >
      <div
        className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2"
        style={{
          borderBottom: '1px solid var(--rule-hairline)',
          backgroundColor: 'var(--bg-ground)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono-num text-[10px] font-semibold" style={{ color: 'var(--ink-cobalt)' }}>
            02
          </span>
          <span className="micro-label truncate" style={{ color: 'var(--ink-primary)' }}>
            GRIMMER SD Parity Lattice
          </span>
        </div>
        <div className="flex items-center gap-3 mono-num text-[10px]" style={{ color: 'var(--ink-slate)' }}>
          <span>Q ≡ S ({grimmer.sumParity}) mod 2</span>
          <span className="hidden sm:inline" style={{ color: 'var(--ink-muted)' }}>
            │ Valid · ┆ Forbidden
          </span>
        </div>
      </div>

      <div className="px-2 pt-1.5 pb-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SD_SVG_H}`}
          className="w-full h-auto block cursor-crosshair select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          role="img"
          aria-label={`GRIMMER SD parity lattice centered at ${grimmer.reportedSd.toFixed(grimmer.sdDecimals)}`}
          data-testid="grimmer-caliper-svg"
        >
          <SdCaliperStatic grimmer={grimmer} minVal={minVal} maxVal={maxVal} />
          <g
            ref={probeGroupRef}
            style={{ opacity: 0, pointerEvents: 'none', transition: 'opacity 100ms linear' }}
          >
            <line
              x1={0}
              y1={20}
              x2={0}
              y2={AXIS_Y + 24}
              stroke="#1D4ED8"
              strokeWidth="1.4"
            />
            <circle cx={0} cy={AXIS_Y} r="4.5" fill="none" stroke="#1D4ED8" strokeWidth="1.6" />
          </g>
        </svg>
      </div>

      <div
        className="px-3.5 py-1.5 flex items-center justify-between gap-2 mono-num text-[10.5px]"
        style={{
          borderTop: '1px solid var(--rule-hairline)',
          backgroundColor:
            hoveredIdx !== null
              ? activePoint && !activePoint.parityValid
                ? 'var(--tint-vermilion)'
                : 'var(--tint-cobalt)'
              : 'var(--bg-folio)',
          color:
            hoveredIdx !== null
              ? activePoint && !activePoint.parityValid
                ? 'var(--ink-vermilion)'
                : 'var(--ink-cobalt)'
              : 'var(--ink-slate)',
        }}
      >
        {activePoint ? (
          <>
            <span className="truncate">
              {hoveredIdx !== null ? 'PROBE' : 'NEAREST VALID'} · Q = {activePoint.q} (
              {activePoint.parity}
              {!activePoint.parityValid ? ' — FORBIDDEN' : ''}) · SD ={' '}
              {activePoint.sd.toFixed(Math.max(4, grimmer.sdDecimals + 2))}
            </span>
            <span className="whitespace-nowrap shrink-0">
              Δ = {activePoint.delta >= 0 ? '+' : ''}
              {activePoint.delta.toFixed(Math.max(4, grimmer.sdDecimals + 2))}
            </span>
          </>
        ) : (
          <span>No SD lattice available.</span>
        )}
      </div>
    </section>
  );
}

interface VernierCaliperSvgProps {
  audit: TableRowAudit;
}

export function VernierCaliperSvg({ audit }: VernierCaliperSvgProps) {
  const { grim, grimmer } = audit;

  const nearestValidMeanStr = useMemo(() => {
    const pts = grim.nearestPossibleMeans;
    if (pts.length === 0) return '—';
    const below = pts.filter((p) => p.mean <= grim.reportedMean).slice(-1)[0];
    const above = pts.find((p) => p.mean >= grim.reportedMean);
    if (below && above && below.sum === above.sum) return `${below.formatted} (S=${below.sum})`;
    return [
      below ? `${below.formatted} (S=${below.sum})` : null,
      above ? `${above.formatted} (S=${above.sum})` : null,
    ]
      .filter(Boolean)
      .join(' / ');
  }, [grim]);

  const nearestValidSdStr = useMemo(() => {
    if (!grimmer || !grimmer.applicable) return '—';
    const valid = grimmer.nearestPossibleSDs.filter((p) => p.parityValid);
    if (valid.length === 0) return '—';
    const below = valid.filter((p) => p.sd <= grimmer.reportedSd).slice(-1)[0];
    const above = valid.find((p) => p.sd >= grimmer.reportedSd);
    if (below && above && below.q === above.q) return `${below.formatted} (Q=${below.q})`;
    return [
      below ? `${below.formatted} (Q=${below.q})` : null,
      above ? `${above.formatted} (Q=${above.q})` : null,
    ]
      .filter(Boolean)
      .join(' / ');
  }, [grimmer]);

  const proofRows: Array<{ label: string; value: string; highlight?: 'vermilion' | 'forest' }> = [
    {
      label: 'Effective N (N × k)',
      value: `${audit.input.n} × ${audit.input.items} = ${grim.nEff}`,
    },
    {
      label: 'Reporting Precision',
      value: `d_M = ${grim.decimals}${grimmer ? ` · d_SD = ${grimmer.sdDecimals}` : ''} (10^${grim.decimals} = ${Math.pow(10, grim.decimals)})`,
    },
    {
      label: 'Implied Integer Sum (S)',
      value: grim.impliedSum !== null ? `${grim.impliedSum}` : 'NONE IN WINDOW',
      highlight: grim.applicable && !grim.consistent ? 'vermilion' : grim.applicable ? 'forest' : undefined,
    },
    {
      label: 'Parity Invariant (S mod 2)',
      value:
        grim.impliedSum !== null
          ? `${((grim.impliedSum % 2) + 2) % 2 === 0 ? 'EVEN (0)' : 'ODD (1)'}`
          : 'UNRESOLVED',
    },
    {
      label: 'Cauchy-Schwarz Floor (Q_min)',
      value: grimmer?.qMinDiscrete !== null && grimmer?.qMinDiscrete !== undefined ? `${grimmer.qMinDiscrete}` : '—',
    },
    {
      label: 'Permissible Q Window',
      value:
        grimmer?.qWindowLow !== null &&
        grimmer?.qWindowLow !== undefined &&
        grimmer?.qWindowHigh !== null &&
        grimmer?.qWindowHigh !== undefined
          ? `[${grimmer.qWindowLow.toFixed(2)}, ${grimmer.qWindowHigh.toFixed(2)}]`
          : '—',
    },
    {
      label: 'Valid Parity Integers',
      value:
        grimmer && grimmer.applicable
          ? grimmer.validParityCandidates.length > 0
            ? `{${grimmer.validParityCandidates.join(', ')}}`
            : grimmer.parityForbiddenInWindow.length > 0
              ? `∅ (ghost Q = ${grimmer.parityForbiddenInWindow.join(', ')})`
              : '∅ (granularity gap)'
          : '—',
      highlight:
        grimmer && grimmer.applicable
          ? grimmer.consistent
            ? 'forest'
            : 'vermilion'
          : undefined,
    },
    {
      label: 'Nearest Valid Mean / SD',
      value: `${nearestValidMeanStr}${grimmer && grimmer.applicable ? ` · ${nearestValidSdStr}` : ''}`,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Instrument 1: GRIM Mean Caliper */}
      <MeanVernierAxis grim={grim} />

      {/* Instrument 2: GRIMMER SD Parity Caliper */}
      {grimmer && grimmer.applicable ? (
        <SdVernierAxis grimmer={grimmer} />
      ) : (
        <section
          className="px-4 py-3.5"
          style={{
            backgroundColor: 'var(--bg-folio)',
            border: '1px solid var(--rule-hairline)',
            borderRadius: '2px',
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="mono-num text-[10px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
              02
            </span>
            <span className="micro-label" style={{ color: 'var(--ink-slate)' }}>
              GRIMMER SD Parity Lattice — Inactive
            </span>
          </div>
          <p className="text-[12px] leading-relaxed m-0" style={{ color: 'var(--ink-slate)' }}>
            {grimmer
              ? grimmer.reason
              : 'Provide a non-empty Standard Deviation (SD) with N ≥ 2 to evaluate Allard (2018) parity constraints.'}
          </p>
        </section>
      )}

      {/* Mathematical Proof Trace Folio */}
      <section
        style={{
          backgroundColor: 'var(--bg-folio)',
          border: '1px solid var(--rule-hairline)',
          borderRadius: '2px',
        }}
      >
        <div
          className="px-3.5 py-2 flex items-center justify-between"
          style={{
            borderBottom: '1px solid var(--rule-hairline)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          <span className="micro-label" style={{ color: 'var(--ink-primary)' }}>
            Mathematical Proof Trace
          </span>
          <span className="mono-num text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            ALLARD (2018) · EXACT INTEGER LATTICE
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2">
          {proofRows.map((item, idx) => (
            <div
              key={item.label}
              className="px-3.5 py-2"
              style={{
                borderBottom: '1px solid var(--rule-hairline)',
                borderRight: idx % 2 === 0 ? '1px solid var(--rule-hairline)' : undefined,
              }}
            >
              <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-slate)' }}>
                {item.label}
              </div>
              <div
                className="mono-num text-[12px] font-medium mt-0.5 break-words"
                style={{
                  color:
                    item.highlight === 'vermilion'
                      ? 'var(--ink-vermilion)'
                      : item.highlight === 'forest'
                        ? 'var(--ink-forest)'
                        : 'var(--ink-primary)',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="px-3.5 py-3 space-y-1.5">
          {audit.proofSteps.map((step) => (
            <p
              key={step}
              className="text-[11.5px] leading-relaxed m-0"
              style={{ color: 'var(--ink-slate)' }}
            >
              {step}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
