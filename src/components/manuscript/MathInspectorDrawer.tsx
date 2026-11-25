import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PdfFinding } from '../../types/forensics';
import {
  chiSquarePdf,
  chiSquarePValue,
  criticalValue,
  fPdf,
  fPValue,
  normalZPdf,
  normalZPValue,
  studentTPdf,
  studentTPValue,
} from '../../engine/distributions';
import { VerdictStamp } from '../layout/VerdictStamp';

const SVG_W = 540;
const SVG_H = 154;
const PAD_L = 36;
const PAD_R = 20;
const PAD_T = 22;
const PAD_B = 28;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const BASE_Y = PAD_T + PLOT_H;

interface CurveModel {
  isSymmetric: boolean;
  xMin: number;
  xMax: number;
  obsX: number;
  critX: number;
  axisLabel: string;
  formulaExpr: string;
  pdf: (x: number) => number;
  tailP: (x: number) => number;
}

function buildCurveModel(finding: PdfFinding): CurveModel {
  const { testType, df1, df2, statValue } = finding;

  if (testType === 't' || testType === 'r') {
    const df = Math.max(1, df1 ?? 30);
    const obsT =
      testType === 'r'
        ? Math.abs(statValue) >= 0.9999
          ? Math.sign(statValue || 1) * 10
          : statValue * Math.sqrt(df / Math.max(1e-9, 1 - statValue * statValue))
        : statValue;
    const crit = criticalValue('t', df, null, 0.05, 2);
    const bound = Math.max(3.8, Math.min(8.5, Math.max(Math.abs(obsT) * 1.38, crit * 1.65)));

    return {
      isSymmetric: true,
      xMin: -bound,
      xMax: bound,
      obsX: Math.max(-bound + 0.05, Math.min(bound - 0.05, obsT)),
      critX: crit,
      axisLabel: testType === 'r' ? `t-transform of r(${df})` : `Student t (df = ${df})`,
      formulaExpr:
        testType === 'r'
          ? `t = r√(df/(1−r²)) = ${obsT.toFixed(3)} · p = I_x(df/2, 1/2)`
          : `p = I_x(df/2, 1/2), x = df/(df + t²)`,
      pdf: (x) => studentTPdf(x, df),
      tailP: (x) => studentTPValue(x, df, 2),
    };
  }

  if (testType === 'z') {
    const crit = criticalValue('z', null, null, 0.05, 2);
    const bound = Math.max(3.8, Math.min(7.5, Math.max(Math.abs(statValue) * 1.38, crit * 1.65)));
    return {
      isSymmetric: true,
      xMin: -bound,
      xMax: bound,
      obsX: Math.max(-bound + 0.05, Math.min(bound - 0.05, statValue)),
      critX: crit,
      axisLabel: 'Standard Normal z ~ N(0, 1)',
      formulaExpr: 'p = erfc(|z| / √2)',
      pdf: (x) => normalZPdf(x),
      tailP: (x) => normalZPValue(x, 2),
    };
  }

  if (testType === 'F') {
    const d1 = Math.max(1, df1 ?? 2);
    const d2 = Math.max(1, df2 ?? 30);
    const crit = criticalValue('F', d1, d2, 0.05, 2);
    const xMax = Math.max(5.5, Math.min(18, Math.max(statValue * 1.45, crit * 1.75)));
    return {
      isSymmetric: false,
      xMin: 0.001,
      xMax,
      obsX: Math.max(0.01, Math.min(xMax - 0.05, statValue)),
      critX: crit,
      axisLabel: `Snedecor F(${d1}, ${d2})`,
      formulaExpr: 'p = I_x(df₂/2, df₁/2), x = df₂/(df₂ + df₁·F)',
      pdf: (x) => fPdf(x, d1, d2),
      tailP: (x) => fPValue(x, d1, d2),
    };
  }

  // chi2
  const df = Math.max(1, df1 ?? 1);
  const crit = criticalValue('chi2', df, null, 0.05, 2);
  const xMax = Math.max(7.5, Math.min(36, Math.max(statValue * 1.5, crit * 1.85)));
  return {
    isSymmetric: false,
    xMin: df <= 2 ? 0.06 : 0.001,
    xMax,
    obsX: Math.max(0.06, Math.min(xMax - 0.05, statValue)),
    critX: crit,
    axisLabel: `Chi-Square χ²(df = ${df})`,
    formulaExpr: 'p = Q(df/2, χ²/2) (Regularized Upper Gamma)',
    pdf: (x) => chiSquarePdf(x, df),
    tailP: (x) => chiSquarePValue(x, df),
  };
}

interface StaticDensityProps {
  model: CurveModel;
  verdict: PdfFinding['verdict'];
  maxY: number;
  samples: Array<{ x: number; y: number }>;
}

const StaticDensitySvg = React.memo(function StaticDensitySvg({
  model,
  verdict,
  maxY,
  samples,
}: StaticDensityProps) {
  const xSpan = Math.max(1e-9, model.xMax - model.xMin);
  const toX = (x: number) => PAD_L + ((x - model.xMin) / xSpan) * PLOT_W;
  const toY = (y: number) => BASE_Y - (Math.min(y, maxY) / maxY) * PLOT_H;

  const linePath = useMemo(() => {
    return samples
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.x).toFixed(2)} ${toY(pt.y).toFixed(2)}`)
      .join(' ');
  }, [samples, model.xMin, xSpan, maxY]);

  const buildAreaPath = (fromX: number, toValX: number): string => {
    const lo = Math.max(model.xMin, fromX);
    const hi = Math.min(model.xMax, toValX);
    if (hi <= lo) return '';
    const sub = samples.filter((p) => p.x >= lo && p.x <= hi);
    const startPt = { x: lo, y: model.pdf(lo) };
    const endPt = { x: hi, y: model.pdf(hi) };
    const all = [startPt, ...sub, endPt];
    const topStr = all
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.x).toFixed(2)} ${toY(pt.y).toFixed(2)}`)
      .join(' ');
    return `${topStr} L ${toX(hi).toFixed(2)} ${BASE_Y.toFixed(2)} L ${toX(lo).toFixed(2)} ${BASE_Y.toFixed(2)} Z`;
  };

  const rightRejectPath = buildAreaPath(model.critX, model.xMax);
  const leftRejectPath = model.isSymmetric ? buildAreaPath(model.xMin, -model.critX) : '';

  const obsColor =
    verdict === 'DECISION ERROR'
      ? '#C62828'
      : verdict === 'ROUNDING DRIFT'
        ? '#B36B00'
        : '#166534';

  const obsPx = toX(model.obsX);
  const obsPy = toY(model.pdf(model.obsX));
  const critRightPx = toX(model.critX);
  const critLeftPx = model.isSymmetric ? toX(-model.critX) : null;

  // Clean 5-tick x-axis
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const count = 6;
    for (let i = 0; i <= count; i++) {
      ticks.push(model.xMin + (xSpan * i) / count);
    }
    return ticks;
  }, [model.xMin, xSpan]);

  return (
    <g>
      {/* Subtle horizontal grid hairlines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = BASE_Y - frac * PLOT_H;
        return (
          <line
            key={frac}
            x1={PAD_L}
            y1={y}
            x2={SVG_W - PAD_R}
            y2={y}
            stroke="#ECE8DE"
            strokeWidth="1"
          />
        );
      })}

      {/* Shaded α = 0.05 critical rejection regions */}
      {rightRejectPath && <path d={rightRejectPath} fill="rgba(198, 40, 40, 0.14)" />}
      {leftRejectPath && <path d={leftRejectPath} fill="rgba(198, 40, 40, 0.14)" />}

      {/* Exact analytical density curve */}
      <path d={linePath} fill="none" stroke="#141412" strokeWidth="1.5" />

      {/* Critical value dashed hairlines */}
      {critRightPx <= SVG_W - PAD_R && (
        <g>
          <line
            x1={critRightPx}
            y1={PAD_T}
            x2={critRightPx}
            y2={BASE_Y}
            stroke="#C62828"
            strokeWidth="1"
            strokeDasharray="3 2.5"
          />
          <text
            x={Math.min(SVG_W - PAD_R - 22, critRightPx + 4)}
            y={PAD_T + 10}
            fill="#C62828"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
          >
            α=.05 ({model.critX.toFixed(2)})
          </text>
        </g>
      )}
      {critLeftPx !== null && critLeftPx >= PAD_L && (
        <line
          x1={critLeftPx}
          y1={PAD_T}
          x2={critLeftPx}
          y2={BASE_Y}
          stroke="#C62828"
          strokeWidth="1"
          strokeDasharray="3 2.5"
        />
      )}

      {/* Baseline axis */}
      <line x1={PAD_L} y1={BASE_Y} x2={SVG_W - PAD_R} y2={BASE_Y} stroke="#141412" strokeWidth="1.1" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={BASE_Y} stroke="#DCD6CA" strokeWidth="1" />

      {/* X-axis tick labels */}
      {xTicks.map((v, i) => {
        const x = toX(v);
        return (
          <g key={i}>
            <line x1={x} y1={BASE_Y} x2={x} y2={BASE_Y + 4} stroke="#5C5850" strokeWidth="1" />
            <text
              x={x}
              y={BASE_Y + 15}
              textAnchor="middle"
              fill="#5C5850"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              {Math.abs(v) < 0.05 ? '0' : v.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Observed Statistic Vertical Needle */}
      <g>
        <line
          x1={obsPx}
          y1={PAD_T - 4}
          x2={obsPx}
          y2={BASE_Y}
          stroke={obsColor}
          strokeWidth="1.6"
        />
        <circle cx={obsPx} cy={obsPy} r="3.5" fill={obsColor} />
        <polygon
          points={`${obsPx},${PAD_T - 1} ${obsPx - 4},${PAD_T - 7} ${obsPx + 4},${PAD_T - 7}`}
          fill={obsColor}
        />
        <text
          x={Math.max(PAD_L + 44, Math.min(SVG_W - PAD_R - 44, obsPx))}
          y={11}
          textAnchor="middle"
          fill={obsColor}
          fontSize="9.5"
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          OBS = {model.obsX.toFixed(2)}
        </text>
      </g>
    </g>
  );
});

interface MathInspectorDrawerProps {
  finding: PdfFinding;
  onClose: () => void;
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return 'NaN';
  if (p < 0.0001) return '< .0001';
  return p.toFixed(4).replace(/^0\./, '.');
}

export function MathInspectorDrawer({ finding, onClose }: MathInspectorDrawerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const probeLineRef = useRef<SVGLineElement>(null);
  const probeDotRef = useRef<SVGCircleElement>(null);
  const rafRef = useRef<number | null>(null);
  const [probeReadout, setProbeReadout] = useState<{ x: number; y: number; p: number } | null>(null);

  const model = useMemo(() => buildCurveModel(finding), [finding]);

  const { samples, maxY } = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    const steps = 160;
    let peak = 0.05;
    for (let i = 0; i <= steps; i++) {
      const x = model.xMin + ((model.xMax - model.xMin) * i) / steps;
      const rawY = model.pdf(x);
      const y = Number.isFinite(rawY) ? Math.min(rawY, 1.8) : 0;
      if (y > peak) peak = y;
      pts.push({ x, y });
    }
    return { samples: pts, maxY: peak * 1.12 };
  }, [model]);

  const xSpan = Math.max(1e-9, model.xMax - model.xMin);
  const toX = useCallback((x: number) => PAD_L + ((x - model.xMin) / xSpan) * PLOT_W, [model.xMin, xSpan]);
  const toY = useCallback((y: number) => BASE_Y - (Math.min(y, maxY) / maxY) * PLOT_H, [maxY]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const clampedPx = Math.max(PAD_L, Math.min(SVG_W - PAD_R, svgX));
      const xVal = model.xMin + ((clampedPx - PAD_L) / PLOT_W) * xSpan;
      const yVal = Math.min(1.8, Math.max(0, model.pdf(xVal)));
      const pVal = model.tailP(xVal);
      const yPx = toY(yVal);

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (probeLineRef.current) {
          probeLineRef.current.style.opacity = '1';
          probeLineRef.current.setAttribute('transform', `translate(${clampedPx}, 0)`);
        }
        if (probeDotRef.current) {
          probeDotRef.current.style.opacity = '1';
          probeDotRef.current.setAttribute('transform', `translate(${clampedPx}, ${yPx})`);
        }
        setProbeReadout({ x: xVal, y: yVal, p: pVal });
      });
    },
    [model, xSpan, toY]
  );

  const handlePointerLeave = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (probeLineRef.current) probeLineRef.current.style.opacity = '0';
    if (probeDotRef.current) probeDotRef.current.style.opacity = '0';
    setProbeReadout(null);
  }, []);

  const isDirectional = finding.testType === 't' || finding.testType === 'r' || finding.testType === 'z';

  return (
    <section
      aria-label="Probability distribution math inspector"
      data-testid="math-inspector-drawer"
      className="shrink-0 flex flex-col"
      style={{
        backgroundColor: 'var(--bg-folio)',
        borderTop: '1.5px solid var(--ink-primary)',
      }}
    >
      {/* Inspector Header */}
      <div
        className="px-3.5 py-2 flex items-center justify-between gap-2"
        style={{
          backgroundColor: 'var(--bg-ground)',
          borderBottom: '1px solid var(--rule-hairline)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono-num text-[10px] font-semibold" style={{ color: 'var(--ink-cobalt)' }}>
            P.{String(finding.page).padStart(2, '0')}
          </span>
          <span className="mono-num text-[12px] font-semibold truncate" style={{ color: 'var(--ink-primary)' }}>
            {finding.rawMatch}
          </span>
          <VerdictStamp verdict={finding.verdict} size="sm" animateKey={`drawer-${finding.id}`} />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close math inspector drawer"
          className="w-6 h-6 inline-flex items-center justify-center cursor-pointer hover:bg-[#ECE8DE]"
          style={{
            color: 'var(--ink-slate)',
            border: '1px solid var(--rule-hairline)',
            borderRadius: '2px',
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bespoke 60 FPS SVG Probability Density Plot */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className="mono-num text-[10.5px] font-medium tracking-[0.02em]"
            style={{ color: 'var(--ink-slate)' }}
          >
            {model.axisLabel}
          </span>
          <span className="mono-num text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            {model.formulaExpr}
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto block cursor-crosshair select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          role="img"
          aria-label={`Probability density curve for ${finding.rawMatch}`}
          data-testid="pdf-density-svg"
        >
          <StaticDensitySvg
            model={model}
            verdict={finding.verdict}
            maxY={maxY}
            samples={samples}
          />
          <line
            ref={probeLineRef}
            x1={0}
            y1={PAD_T}
            x2={0}
            y2={BASE_Y}
            stroke="#1D4ED8"
            strokeWidth="1.2"
            style={{ opacity: 0, pointerEvents: 'none' }}
          />
          <circle
            ref={probeDotRef}
            cx={0}
            cy={0}
            r="3.2"
            fill="#1D4ED8"
            style={{ opacity: 0, pointerEvents: 'none' }}
          />
        </svg>

        {/* Live Telemetry Readout Bar */}
        <div
          className="px-2 py-1 mt-1 flex items-center justify-between mono-num text-[10px]"
          style={{
            backgroundColor: probeReadout ? 'var(--tint-cobalt)' : 'var(--bg-ground)',
            color: probeReadout ? 'var(--ink-cobalt)' : 'var(--ink-slate)',
            border: '1px solid var(--rule-hairline)',
            borderRadius: '1px',
          }}
        >
          {probeReadout ? (
            <>
              <span>
                PROBE · x = {probeReadout.x.toFixed(3)} · f(x) = {probeReadout.y.toFixed(4)}
              </span>
              <span>
                {model.isSymmetric ? '2-tail p' : 'Upper p'} = {fmtP(probeReadout.p)}
              </span>
            </>
          ) : (
            <>
              <span>
                ROUNDING WINDOW [{fmtP(finding.pWindowTwoTailed[0])}, {fmtP(finding.pWindowTwoTailed[1])}]
              </span>
              <span>SWEEP CURVE TO PROBE</span>
            </>
          )}
        </div>
      </div>

      {/* Exact Tabular Breakdown + One-Tailed Sensitivity Check */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 mt-1.5"
        style={{ borderTop: '1px solid var(--rule-hairline)' }}
      >
        <div className="px-3 py-2" style={{ borderRight: '1px solid var(--rule-hairline)' }}>
          <div className="text-[9.5px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-slate)' }}>
            Reported <span className="normal-case">p</span>
          </div>
          <div className="mono-num text-[12px] font-semibold mt-0.5" style={{ color: 'var(--ink-primary)' }}>
            {finding.pComparator} {finding.pRaw}
          </div>
        </div>

        <div className="px-3 py-2" style={{ borderRight: '1px solid var(--rule-hairline)' }}>
          <div className="text-[9.5px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-slate)' }}>
            Exact (2-Tail)
          </div>
          <div
            className="mono-num text-[12px] font-semibold mt-0.5"
            style={{
              color:
                finding.verdict === 'DECISION ERROR'
                  ? 'var(--ink-vermilion)'
                  : finding.verdict === 'ROUNDING DRIFT'
                    ? 'var(--ink-amber)'
                    : 'var(--ink-forest)',
            }}
          >
            {fmtP(finding.pComputedTwoTailed)}
          </div>
        </div>

        <div className="px-3 py-2" style={{ borderRight: '1px solid var(--rule-hairline)' }}>
          <div className="text-[9.5px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-slate)' }}>
            1-Tailed Check
          </div>
          <div
            className="mono-num text-[11.5px] font-medium mt-0.5"
            style={{
              color: finding.oneTailedConsistent ? 'var(--ink-amber)' : 'var(--ink-slate)',
            }}
          >
            {isDirectional
              ? `${fmtP(finding.pComputedOneTailed)}${finding.oneTailedConsistent ? ' · MATCH' : ''}`
              : 'N/A (1-sided)'}
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="text-[9.5px] uppercase tracking-[0.08em]" style={{ color: 'var(--ink-slate)' }}>
            <span className="normal-case">α</span> = .05 Critical
          </div>
          <div className="mono-num text-[12px] font-medium mt-0.5" style={{ color: 'var(--ink-primary)' }}>
            {model.isSymmetric ? `±${model.critX.toFixed(3)}` : model.critX.toFixed(3)}
          </div>
        </div>
      </div>

      {finding.oneTailedConsistent && (
        <div
          className="px-3.5 py-1.5 text-[11px]"
          style={{
            backgroundColor: 'var(--tint-amber)',
            color: 'var(--ink-amber)',
            borderTop: '1px solid var(--rule-amber)',
          }}
        >
          Sensitivity Note: One-tailed p ={' '}
          <span className="mono-num font-semibold">{fmtP(finding.pComputedOneTailed)}</span> would
          align with the reported claim, suggesting an undisclosed directional test or copy error.
        </div>
      )}
    </section>
  );
}
