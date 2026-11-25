import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { SelfTestReport } from '../../types/forensics';

interface BottomRailProps {
  selfTest: SelfTestReport;
  onOpenSelfTest: () => void;
}

export function BottomRail({ selfTest, onOpenSelfTest }: BottomRailProps) {
  return (
    <footer
      className="h-[28px] shrink-0 px-4 flex items-center justify-between gap-4 select-none z-20"
      style={{
        backgroundColor: 'var(--bg-folio)',
        borderTop: '1px solid var(--rule-hairline)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="text-[10px] font-medium uppercase tracking-[0.11em] whitespace-nowrap"
          style={{ color: 'var(--ink-slate)' }}
        >
          ZERO-UPLOAD · CLIENT-SIDE DOUBLE PRECISION
        </span>
        <span
          className="hidden sm:inline text-[10px] tracking-[0.08em] uppercase whitespace-nowrap"
          style={{ color: 'var(--ink-muted)' }}
        >
          · ↑/↓ STEP ROWS · IEEE-754 FLOAT GUARD
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenSelfTest}
        className="h-[22px] px-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:bg-[#F4F1EA]"
        style={{
          color: selfTest.allPassed ? 'var(--ink-forest)' : 'var(--ink-vermilion)',
          border: `1px solid ${selfTest.allPassed ? 'var(--rule-forest)' : 'var(--rule-vermilion)'}`,
          backgroundColor: selfTest.allPassed ? 'var(--tint-forest)' : 'var(--tint-vermilion)',
          borderRadius: '1px',
        }}
      >
        <span aria-hidden="true">{selfTest.allPassed ? '✓' : '✕'}</span>
        <span>
          KERNEL SELF-CHECK · {selfTest.passedCount}/{selfTest.totalCount}{' '}
          {selfTest.allPassed ? 'PASS' : 'FAIL'}
        </span>
      </button>
    </footer>
  );
}

interface SelfCheckModalProps {
  open: boolean;
  report: SelfTestReport;
  onClose: () => void;
}

export function SelfCheckModal({ open, report, onClose }: SelfCheckModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(20, 20, 18, 0.36)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kernel-selfcheck-title"
        className="w-full max-w-[980px] max-h-[84vh] flex flex-col"
        style={{
          backgroundColor: 'var(--bg-folio)',
          border: '1px solid var(--ink-primary)',
          borderRadius: '2px',
          boxShadow: '0 12px 32px rgba(20, 20, 18, 0.16)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between gap-4 shrink-0"
          style={{ borderBottom: '1px solid var(--rule-hairline)' }}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                id="kernel-selfcheck-title"
                className="font-editorial text-[24px] leading-none"
                style={{ color: 'var(--ink-primary)' }}
              >
                Numerical Kernel Verification Ledger
              </h2>
              <span
                className="mono-num text-[11px] font-semibold px-1.5 py-0.5"
                style={{
                  color: report.allPassed ? 'var(--ink-forest)' : 'var(--ink-vermilion)',
                  backgroundColor: report.allPassed ? 'var(--tint-forest)' : 'var(--tint-vermilion)',
                  border: `1px solid ${report.allPassed ? 'var(--rule-forest)' : 'var(--rule-vermilion)'}`,
                  borderRadius: '1px',
                }}
              >
                {report.passedCount}/{report.totalCount} PASS
              </span>
            </div>
            <p className="text-[12px] mt-1" style={{ color: 'var(--ink-slate)' }}>
              Deterministic textbook &amp; R/SciPy ground-truth checks executed locally in{' '}
              <span className="mono-num">{report.elapsedMs.toFixed(2)} ms</span> (9-term Lanczos,
              Lentz continued fractions, Allard parity GRIMMER).
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close kernel verification modal"
            className="w-8 h-8 flex items-center justify-center cursor-pointer transition-colors hover:bg-[#ECE8DE]"
            style={{
              color: 'var(--ink-primary)',
              border: '1px solid var(--rule-hairline)',
              borderRadius: '2px',
            }}
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Assertions Table */}
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          <table className="w-full border-collapse text-left table-fixed">
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-ground)',
                  borderBottom: '1px solid var(--rule-hairline)',
                }}
              >
                <th className="py-2 pl-4 pr-2 micro-label w-[112px]" style={{ color: 'var(--ink-slate)' }}>
                  Module
                </th>
                <th className="py-2 px-2.5 micro-label w-[29%]" style={{ color: 'var(--ink-slate)' }}>
                  Assertion &amp; Input
                </th>
                <th className="py-2 px-2.5 micro-label w-[22%]" style={{ color: 'var(--ink-slate)' }}>
                  Expected
                </th>
                <th className="py-2 px-2.5 micro-label w-[22%]" style={{ color: 'var(--ink-slate)' }}>
                  Computed
                </th>
                <th className="py-2 px-2.5 micro-label text-right w-[84px]" style={{ color: 'var(--ink-slate)' }}>
                  |Error|
                </th>
                <th className="py-2 pl-2 pr-4 micro-label text-right w-[76px]" style={{ color: 'var(--ink-slate)' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {report.assertions.map((a) => (
                <tr
                  key={a.id}
                  style={{ borderBottom: '1px solid var(--rule-hairline)' }}
                >
                  <td
                    className="py-2 pl-4 pr-2 mono-num text-[10px] whitespace-nowrap align-top"
                    style={{ color: 'var(--ink-slate)' }}
                  >
                    {a.category}
                  </td>
                  <td className="py-2 px-2.5 align-top">
                    <div
                      className="text-[11.5px] font-medium leading-snug"
                      style={{ color: 'var(--ink-primary)' }}
                    >
                      {a.name}
                    </div>
                    <div className="mono-num text-[10.5px] mt-0.5" style={{ color: 'var(--ink-slate)' }}>
                      {a.inputSummary}
                    </div>
                  </td>
                  <td
                    className="py-2 px-2.5 mono-num text-[10.5px] leading-snug break-words align-top"
                    style={{ color: 'var(--ink-slate)' }}
                  >
                    {a.expected}
                  </td>
                  <td
                    className="py-2 px-2.5 mono-num text-[10.5px] leading-snug break-words align-top"
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    {a.computed}
                  </td>
                  <td
                    className="py-2 px-2.5 mono-num text-[10.5px] text-right whitespace-nowrap align-top"
                    style={{ color: 'var(--ink-slate)' }}
                  >
                    {a.absError === null
                      ? '—'
                      : a.absError === 0
                        ? '0.00e+0'
                        : a.absError.toExponential(2)}
                  </td>
                  <td className="py-2 pl-2 pr-4 text-right whitespace-nowrap align-top">
                    <span
                      className="mono-num text-[10.5px] font-semibold"
                      style={{
                        color: a.passed ? 'var(--ink-forest)' : 'var(--ink-vermilion)',
                      }}
                    >
                      {a.passed ? '✓ PASS' : '✕ FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
