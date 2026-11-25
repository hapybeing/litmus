import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { LabMode, SelfTestReport } from '../../types/forensics';

interface StagingPlateProps {
  mode: Exclude<LabMode, 'table'>;
  selfTest: SelfTestReport;
  onGoToTableLab: () => void;
  onOpenSelfTest: () => void;
}

const PLATE_CONFIG = {
  manuscript: {
    index: 'LAB 01',
    phase: 'PHASE 2 INSTRUMENT',
    title: 'Manuscript PDF Forensics & Statistical Cross-Examination',
    description:
      'High-DPI browser-native PDF rendering with coordinate-mapped test overlays, exact rounding-window p-value auditing, N-drift detection, and interactive probability density inspection.',
    readyModules: [
      {
        file: 'src/engine/distributions.ts',
        detail: '9-term Lanczos logGamma, modified Lentz I_x(a,b), Q(a,x), erfc, PDF/CDF & critical thresholds',
      },
      {
        file: 'src/engine/statParser.ts',
        detail: 'APA t / F / χ² / r / z extractor, raw-string decimal rounding-window bounds, and N/df drift sentinel',
      },
      {
        file: 'src/engine/selfTest.ts',
        detail: 'Live verification of decision errors, rounding-window grace, and distribution critical values',
      },
    ],
    queuedComponents: [
      'Version-matched pdfjs-dist HiDPI viewport & character-offset bounding-box mapper',
      'Deterministic binary PDF 1.4 Specimen Generator (Case File 01)',
      'Interactive SVG Probability Density Drawer (t, F, χ², z) with α = 0.05 critical shading',
    ],
  },
  multiverse: {
    index: 'LAB 03',
    phase: 'PHASE 3 INSTRUMENT',
    title: 'Multiverse Specification Curve & Raw Dataset Forensics',
    description:
      'Combinatorial regression stress-testing across outlier rules, transforms, HC3/Huber estimators, and covariate sets paired with Benford digit conformity and duplicate detection.',
    readyModules: [
      {
        file: 'src/engine/distributions.ts',
        detail: 'Exact Student-t, F, and Chi-square tail integrals for regression inference and Benford χ² tests',
      },
      {
        file: 'src/engine/cryptoHash.ts',
        detail: 'Real WebCrypto SHA-256 dataset fingerprinting for reproducible forensic dossiers',
      },
    ],
    queuedComponents: [
      'Pure-TS Householder QR OLS, HC3 leverage-adjusted SE, and MAD-scaled Huber IRLS engine',
      '60 FPS Specification Curve + 1-to-1 Aligned Dot-Matrix SVG with Blueprint Cobalt probe',
      'Lazy jsDelivr DuckDB-Wasm Parquet loader & Benford / Terminal-Digit / Duplicate Sentinel',
    ],
  },
} as const;

export function StagingPlate({
  mode,
  selfTest,
  onGoToTableLab,
  onOpenSelfTest,
}: StagingPlateProps) {
  const cfg = PLATE_CONFIG[mode];

  return (
    <main className="flex-1 overflow-auto p-6 lg:p-10 flex items-center justify-center">
      <div
        className="w-full max-w-[820px]"
        style={{
          backgroundColor: 'var(--bg-folio)',
          border: '1px solid var(--rule-hairline)',
          borderRadius: '2px',
        }}
      >
        {/* Top Register Strip */}
        <div
          className="px-6 py-3 flex items-center justify-between gap-4"
          style={{
            borderBottom: '1px solid var(--rule-hairline)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="mono-num text-[11px] font-semibold" style={{ color: 'var(--ink-cobalt)' }}>
              {cfg.index}
            </span>
            <span style={{ color: 'var(--rule-strong)' }}>·</span>
            <span className="micro-label" style={{ color: 'var(--ink-slate)' }}>
              {cfg.phase}
            </span>
          </div>
          <span className="mono-num text-[11px]" style={{ color: 'var(--ink-forest)' }}>
            KERNEL VERIFIED ({selfTest.passedCount}/{selfTest.totalCount})
          </span>
        </div>

        {/* Body */}
        <div className="p-6 lg:p-8">
          <h1
            className="font-editorial text-[34px] leading-[1.1] max-w-[640px]"
            style={{ color: 'var(--ink-primary)', textWrap: 'balance' }}
          >
            {cfg.title}
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed max-w-[660px]" style={{ color: 'var(--ink-slate)' }}>
            {cfg.description}
          </p>

          <div
            className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6"
            style={{ borderTop: '1px solid var(--rule-hairline)' }}
          >
            <div>
              <h2 className="micro-label mb-3" style={{ color: 'var(--ink-forest)' }}>
                Active &amp; Verified in Kernel
              </h2>
              <ul className="space-y-3 m-0 p-0 list-none">
                {cfg.readyModules.map((mod) => (
                  <li key={mod.file} className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: 'var(--ink-forest)' }}
                      aria-hidden="true"
                    />
                    <div>
                      <div className="mono-num text-[11.5px] font-medium" style={{ color: 'var(--ink-primary)' }}>
                        {mod.file}
                      </div>
                      <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: 'var(--ink-slate)' }}>
                        {mod.detail}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="micro-label mb-3" style={{ color: 'var(--ink-slate)' }}>
                Queued Interface Instruments
              </h2>
              <ul className="space-y-2.5 m-0 p-0 list-none">
                {cfg.queuedComponents.map((item, idx) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span
                      className="mono-num text-[10.5px] mt-0.5 shrink-0"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      0{idx + 1}
                    </span>
                    <span className="text-[12px] leading-snug" style={{ color: 'var(--ink-slate)' }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className="mt-7 pt-5 flex flex-wrap items-center gap-3"
            style={{ borderTop: '1px solid var(--rule-hairline)' }}
          >
            <button
              type="button"
              onClick={onGoToTableLab}
              className="h-[34px] px-4 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.09em] cursor-pointer transition-colors"
              style={{
                backgroundColor: 'var(--ink-primary)',
                color: 'var(--bg-folio)',
                borderRadius: '2px',
              }}
            >
              <span>Open Lab 02 — Table Check</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onOpenSelfTest}
              className="h-[34px] px-3.5 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.09em] cursor-pointer transition-colors hover:bg-[#F4F1EA]"
              style={{
                backgroundColor: 'var(--bg-folio)',
                color: 'var(--ink-primary)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '2px',
              }}
            >
              <span>Inspect Kernel Self-Check</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
