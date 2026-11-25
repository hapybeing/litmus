import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Table2 } from 'lucide-react';
import type { ManuscriptAuditResult, PdfFinding } from '../../types/forensics';
import { VerdictStamp } from '../layout/VerdictStamp';
import { MathInspectorDrawer } from './MathInspectorDrawer';

type FindingFilter = 'ALL' | 'DECISION ERROR' | 'ROUNDING DRIFT' | 'VERIFIED';

interface ForensicLedgerProps {
  audit: ManuscriptAuditResult | null;
  selectedFindingId: string | null;
  inspectorOpen: boolean;
  onSelectFinding: (id: string) => void;
  onCloseInspector: () => void;
  onSendTablesToLab02: () => void;
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return 'NaN';
  if (p < 0.0001) return '< .0001';
  return p.toFixed(4).replace(/^0\./, '.');
}

function testTypeTag(t: PdfFinding['testType']): string {
  switch (t) {
    case 't':
      return 't-TEST';
    case 'F':
      return 'F-ANOVA';
    case 'chi2':
      return 'χ²-TEST';
    case 'r':
      return 'PEARSON r';
    case 'z':
      return 'z-TEST';
  }
}

export function ForensicLedger({
  audit,
  selectedFindingId,
  inspectorOpen,
  onSelectFinding,
  onCloseInspector,
  onSendTablesToLab02,
}: ForensicLedgerProps) {
  const [filter, setFilter] = useState<FindingFilter>('ALL');

  const findings = audit?.findings ?? [];

  const counts = useMemo(() => {
    let decisionError = 0;
    let roundingDrift = 0;
    let verified = 0;
    for (const f of findings) {
      if (f.verdict === 'DECISION ERROR') decisionError++;
      else if (f.verdict === 'ROUNDING DRIFT') roundingDrift++;
      else verified++;
    }
    return { total: findings.length, decisionError, roundingDrift, verified };
  }, [findings]);

  const filteredFindings = useMemo(() => {
    if (filter === 'ALL') return findings;
    return findings.filter((f) => f.verdict === filter);
  }, [findings, filter]);

  const selectedFinding = useMemo(
    () => findings.find((f) => f.id === selectedFindingId) ?? null,
    [findings, selectedFindingId]
  );

  if (!audit) {
    return (
      <aside
        aria-label="Manuscript forensic ledger"
        className="lg:w-[42%] flex flex-col items-center justify-center p-8"
        style={{ backgroundColor: 'var(--bg-ground)' }}
      >
        <div className="micro-label" style={{ color: 'var(--ink-slate)' }}>
          PARSING MANUSCRIPT LEDGER…
        </div>
      </aside>
    );
  }

  const { driftReport, extractedTableRows, extractedTablePages } = audit;

  return (
    <aside
      aria-label="Manuscript forensic ledger"
      className="lg:w-[42%] flex flex-col min-h-0 overflow-hidden"
      style={{ backgroundColor: 'var(--bg-ground)' }}
    >
      {/* Top Archival Counter & Filter Strip */}
      <div
        className="shrink-0"
        style={{
          backgroundColor: 'var(--bg-folio)',
          borderBottom: '1px solid var(--rule-hairline)',
        }}
      >
        <div className="grid grid-cols-4">
          {(
            [
              { id: 'ALL', label: 'ALL', count: counts.total, color: 'var(--ink-primary)' },
              {
                id: 'DECISION ERROR',
                label: 'DECISION ERR',
                count: counts.decisionError,
                color: 'var(--ink-vermilion)',
              },
              {
                id: 'ROUNDING DRIFT',
                label: 'DRIFT',
                count: counts.roundingDrift,
                color: 'var(--ink-amber)',
              },
              {
                id: 'VERIFIED',
                label: 'VERIFIED',
                count: counts.verified,
                color: 'var(--ink-forest)',
              },
            ] as const
          ).map((item, idx) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                data-testid={`manuscript-filter-${item.id.toLowerCase().replace(/\s+/g, '-')}`}
                className="px-2.5 py-2.5 text-left cursor-pointer transition-colors relative"
                style={{
                  borderRight: idx < 3 ? '1px solid var(--rule-hairline)' : undefined,
                  backgroundColor: active ? 'var(--bg-ground)' : 'var(--bg-folio)',
                }}
              >
                <div
                  className="text-[9.5px] font-semibold uppercase tracking-[0.08em] truncate"
                  style={{ color: item.color }}
                >
                  {item.label}
                </div>
                <div
                  className="mono-num text-[19px] font-semibold leading-tight mt-0.5"
                  style={{ color: item.color }}
                >
                  {item.count}
                </div>
                {active && (
                  <span
                    className="absolute left-0 right-0 bottom-0 h-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Sample-Size (N / df) Drift Strip */}
        <div
          className="px-3.5 py-2"
          style={{
            borderTop: '1px solid var(--rule-hairline)',
            backgroundColor: driftReport.hasDrift ? 'var(--tint-amber)' : 'var(--bg-ground)',
          }}
          data-testid="n-drift-strip"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0">
              {driftReport.hasDrift && (
                <AlertTriangle
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color: 'var(--ink-amber)' }}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: driftReport.hasDrift ? 'var(--ink-amber)' : 'var(--ink-slate)' }}
                >
                  {driftReport.hasDrift
                    ? `Sample-Size (N / df) Drift · Range N = ${driftReport.minN}–${driftReport.maxN} (Δ = ${driftReport.deltaN})`
                    : 'Sample-Size (N / df) Consistency'}
                </div>
                {driftReport.impliedNs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {driftReport.impliedNs.map((entry) => {
                      const isDrop =
                        driftReport.maxN !== null && entry.impliedN < driftReport.maxN - 2;
                      const isActive = entry.findingId === selectedFindingId;
                      return (
                        <button
                          key={entry.findingId}
                          type="button"
                          onClick={() => onSelectFinding(entry.findingId)}
                          title={`Jump to ${entry.rawMatch}`}
                          className="px-1.5 py-0.5 mono-num text-[10px] cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isActive
                              ? 'var(--ink-cobalt)'
                              : isDrop
                                ? 'var(--bg-folio)'
                                : 'transparent',
                            color: isActive
                              ? '#FAF8F4'
                              : isDrop
                                ? 'var(--ink-vermilion)'
                                : 'var(--ink-slate)',
                            border: `1px solid ${
                              isActive
                                ? 'var(--ink-cobalt)'
                                : isDrop
                                  ? 'var(--rule-vermilion)'
                                  : 'var(--rule-hairline)'
                            }`,
                            borderRadius: '1px',
                          }}
                        >
                          {entry.testType}: N={entry.impliedN}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cross-Lab Table Handoff Strip (when descriptive table rows are detected in PDF) */}
        {extractedTableRows.length > 0 && (
          <div
            className="px-3.5 py-2 flex items-center justify-between gap-2"
            style={{
              borderTop: '1px solid var(--rule-hairline)',
              backgroundColor: 'var(--tint-cobalt)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Table2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--ink-cobalt)' }}
                aria-hidden="true"
              />
              <span
                className="text-[11px] font-medium truncate"
                style={{ color: 'var(--ink-primary)' }}
              >
                <span className="mono-num font-semibold">{extractedTableRows.length}</span>{' '}
                Mean/SD/N table rows detected (P.
                {extractedTablePages.join(', ')})
              </span>
            </div>
            <button
              type="button"
              onClick={onSendTablesToLab02}
              data-testid="send-tables-lab02-btn"
              className="h-[24px] px-2.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: 'var(--ink-cobalt)',
                color: '#FAF8F4',
                borderRadius: '2px',
              }}
            >
              <span>Audit in Lab 02</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Interactive Finding Cards List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#DCD6CA]">
        {filteredFindings.length === 0 ? (
          <div className="p-8 text-center">
            <div className="micro-label" style={{ color: 'var(--ink-slate)' }}>
              {findings.length === 0
                ? 'No APA Inline Test Statistics Detected'
                : 'No Findings Match Selected Filter'}
            </div>
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--ink-muted)' }}>
              {findings.length === 0
                ? 'Upload a text-selectable scientific PDF reporting t(df), F(df1, df2), χ²(df), r(df), or z statistics.'
                : 'Switch to ALL to view all extracted findings.'}
            </p>
          </div>
        ) : (
          filteredFindings.map((finding) => {
            const isSelected = finding.id === selectedFindingId;
            return (
              <button
                key={finding.id}
                type="button"
                onClick={() => onSelectFinding(finding.id)}
                data-testid={`finding-card-${finding.id}`}
                className="w-full text-left px-3.5 py-3 block cursor-pointer transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--bg-folio)' : 'var(--bg-ground)',
                  boxShadow: isSelected ? 'inset 2.5px 0 0 0 var(--ink-cobalt)' : undefined,
                }}
              >
                {/* Row 1: Page + Test Tag + Verdict */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="mono-num text-[10px] font-semibold"
                      style={{ color: isSelected ? 'var(--ink-cobalt)' : 'var(--ink-slate)' }}
                    >
                      P.{String(finding.page).padStart(2, '0')}
                    </span>
                    <span style={{ color: 'var(--rule-strong)' }} aria-hidden="true">
                      ·
                    </span>
                    <span
                      className="text-[10px] font-medium uppercase tracking-[0.08em]"
                      style={{ color: 'var(--ink-slate)' }}
                    >
                      {testTypeTag(finding.testType)}
                    </span>
                  </div>
                  <VerdictStamp verdict={finding.verdict} size="sm" animateKey={finding.id} />
                </div>

                {/* Row 2: Exact Quoted Test Clause */}
                <div
                  className="mono-num text-[13px] font-semibold mt-1.5"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {finding.rawMatch}
                </div>

                {/* Row 3: Tabular Reported vs Exact vs Rounding Window */}
                <div className="mt-1.5 grid grid-cols-3 gap-2 mono-num text-[11px]">
                  <div>
                    <span className="text-[9.5px] uppercase block" style={{ color: 'var(--ink-muted)' }}>
                      Reported p
                    </span>
                    <span style={{ color: 'var(--ink-primary)' }}>
                      {finding.pComparator} {finding.pRaw}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] uppercase block" style={{ color: 'var(--ink-muted)' }}>
                      Recomputed
                    </span>
                    <span
                      className="font-semibold"
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
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] uppercase block" style={{ color: 'var(--ink-muted)' }}>
                      Window
                    </span>
                    <span style={{ color: 'var(--ink-slate)' }}>
                      [{fmtP(finding.pWindowTwoTailed[0])}, {fmtP(finding.pWindowTwoTailed[1])}]
                    </span>
                  </div>
                </div>

                {/* Row 4: Context snippet */}
                <p
                  className="mt-1.5 text-[11px] leading-snug line-clamp-2 m-0"
                  style={{ color: 'var(--ink-slate)' }}
                >
                  {finding.contextSnippet}
                </p>
              </button>
            );
          })
        )}
      </div>

      {/* Docked Math Inspector Drawer (Bespoke SVG Probability Density Curve) */}
      {inspectorOpen && selectedFinding && (
        <MathInspectorDrawer finding={selectedFinding} onClose={onCloseInspector} />
      )}
    </aside>
  );
}
