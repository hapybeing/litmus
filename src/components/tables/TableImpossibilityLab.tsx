import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { SdFormulaMode, TableRowAudit, TableRowInput } from '../../types/forensics';
import { parseBatchTableText } from '../../engine/grim';
import { VerdictStamp } from '../layout/VerdictStamp';
import { VernierCaliperSvg } from './VernierCaliperSvg';

type TableFilter = 'ALL' | 'IMPOSSIBLE' | 'VERIFIED';

interface TableImpossibilityLabProps {
  specimenTitle: string;
  specimenSubtitle: string;
  rows: TableRowInput[];
  audits: TableRowAudit[];
  sdMode: SdFormulaMode;
  onSdModeChange: (mode: SdFormulaMode) => void;
  onUpdateRow: (id: string, patch: Partial<TableRowInput>) => void;
  onAddRow: () => void;
  onDeleteRow: (id: string) => void;
  onReplaceRows: (rows: TableRowInput[], customTitle?: string) => void;
  onResetSpecimen: () => void;
}

const SAMPLE_PASTE_TEXT = `Variable, Mean, SD, N, Items
Baseline Recall, 4.25, 1.13, 16, 1
Post-Test Recall, 5.19, 1.42, 12, 1
Delayed Recall 48h, 3.20, 1.36, 10, 1
Likert Subscale, 4.17, 0.94, 12, 3`;

export function TableImpossibilityLab({
  specimenTitle,
  specimenSubtitle,
  rows,
  audits,
  sdMode,
  onSdModeChange,
  onUpdateRow,
  onAddRow,
  onDeleteRow,
  onReplaceRows,
  onResetSpecimen,
}: TableImpossibilityLabProps) {
  const [filter, setFilter] = useState<TableFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string>(rows[2]?.id ?? rows[0]?.id ?? '');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const inspectorPaneRef = useRef<HTMLElement>(null);

  // Reset inspector pane scroll to top on mount and whenever selected row changes
  useEffect(() => {
    const el = inspectorPaneRef.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [selectedId]);

  const counts = useMemo(() => {
    let verified = 0;
    let impossible = 0;
    let inapplicable = 0;
    for (const a of audits) {
      if (a.status === 'VERIFIED') verified++;
      else if (a.status === 'GRIM IMPOSSIBLE' || a.status === 'GRIMMER IMPOSSIBLE') impossible++;
      else inapplicable++;
    }
    return { total: audits.length, verified, impossible, inapplicable };
  }, [audits]);

  const filteredAudits = useMemo(() => {
    if (filter === 'IMPOSSIBLE') {
      return audits.filter(
        (a) => a.status === 'GRIM IMPOSSIBLE' || a.status === 'GRIMMER IMPOSSIBLE'
      );
    }
    if (filter === 'VERIFIED') {
      return audits.filter((a) => a.status === 'VERIFIED');
    }
    return audits;
  }, [audits, filter]);

  // Keep selectedId valid when switching specimens or filters
  useEffect(() => {
    if (filteredAudits.length === 0) return;
    if (!filteredAudits.some((a) => a.input.id === selectedId)) {
      // Prefer first GRIMMER/GRIM impossible row on specimen switch for immediate forensic impact
      const preferred =
        filteredAudits.find((a) => a.status === 'GRIMMER IMPOSSIBLE') ??
        filteredAudits.find((a) => a.status === 'GRIM IMPOSSIBLE') ??
        filteredAudits[0];
      setSelectedId(preferred.input.id);
    }
  }, [filteredAudits, selectedId]);

  const selectedAudit = useMemo(
    () =>
      filteredAudits.find((a) => a.input.id === selectedId) ??
      audits.find((a) => a.input.id === selectedId) ??
      filteredAudits[0] ??
      audits[0] ??
      null,
    [filteredAudits, audits, selectedId]
  );

  // Keyboard ↑/↓ row stepping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (isEditing && !e.altKey) return;
      if (filteredAudits.length === 0) return;

      e.preventDefault();
      const idx = filteredAudits.findIndex((a) => a.input.id === selectedId);
      const nextIdx =
        e.key === 'ArrowDown'
          ? (idx + 1) % filteredAudits.length
          : (idx - 1 + filteredAudits.length) % filteredAudits.length;
      setSelectedId(filteredAudits[nextIdx].input.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredAudits, selectedId]);

  const pastePreviewRows = useMemo(() => parseBatchTableText(pasteText), [pasteText]);

  const handleApplyPaste = () => {
    if (pastePreviewRows.length === 0) return;
    onReplaceRows(pastePreviewRows, `Pasted Table (${pastePreviewRows.length} rows)`);
    setSelectedId(pastePreviewRows[0].id);
    setFilter('ALL');
    setPasteOpen(false);
    setPasteText('');
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Top Archival KPI & Control Strip */}
      <div
        className="shrink-0"
        style={{
          backgroundColor: 'var(--bg-folio)',
          borderBottom: '1px solid var(--rule-hairline)',
        }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <div
            className="px-4 py-2.5 flex items-baseline justify-between gap-2"
            style={{
              borderRight: '1px solid var(--rule-hairline)',
              borderBottom: '1px solid var(--rule-hairline)',
            }}
          >
            <span className="micro-label" style={{ color: 'var(--ink-slate)' }}>
              Rows Audited
            </span>
            <span
              className="mono-num text-[20px] font-semibold leading-none"
              style={{ color: 'var(--ink-primary)' }}
              data-testid="kpi-total"
            >
              {counts.total}
            </span>
          </div>

          <div
            className="px-4 py-2.5 flex items-baseline justify-between gap-2"
            style={{
              borderRight: '1px solid var(--rule-hairline)',
              borderBottom: '1px solid var(--rule-hairline)',
            }}
          >
            <span className="micro-label" style={{ color: 'var(--ink-forest)' }}>
              Verified
            </span>
            <span
              className="mono-num text-[20px] font-semibold leading-none"
              style={{ color: 'var(--ink-forest)' }}
              data-testid="kpi-verified"
            >
              {counts.verified}
            </span>
          </div>

          <div
            className="px-4 py-2.5 flex items-baseline justify-between gap-2"
            style={{
              borderRight: '1px solid var(--rule-hairline)',
              borderBottom: '1px solid var(--rule-hairline)',
            }}
          >
            <span className="micro-label" style={{ color: 'var(--ink-vermilion)' }}>
              GRIM / GRIMMER Impossible
            </span>
            <span
              className="mono-num text-[20px] font-semibold leading-none"
              style={{ color: 'var(--ink-vermilion)' }}
              data-testid="kpi-impossible"
            >
              {counts.impossible}
            </span>
          </div>

          <div
            className="px-4 py-2.5 flex items-baseline justify-between gap-2"
            style={{ borderBottom: '1px solid var(--rule-hairline)' }}
          >
            <span className="micro-label" style={{ color: 'var(--ink-slate)' }}>
              Inapplicable
            </span>
            <span
              className="mono-num text-[20px] font-semibold leading-none"
              style={{ color: 'var(--ink-slate)' }}
              data-testid="kpi-inapplicable"
            >
              {counts.inapplicable}
            </span>
          </div>
        </div>

        {/* Toolbar Row */}
        <div
          className="px-4 py-2 flex flex-wrap items-center justify-between gap-3"
          style={{ backgroundColor: 'var(--bg-ground)' }}
        >
          {/* Filter Tabs */}
          <div className="flex items-center gap-1" role="group" aria-label="Filter audited rows">
            {(
              [
                { id: 'ALL', label: `ALL (${counts.total})` },
                { id: 'IMPOSSIBLE', label: `IMPOSSIBLE (${counts.impossible})` },
                { id: 'VERIFIED', label: `VERIFIED (${counts.verified})` },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className="h-[28px] px-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] whitespace-nowrap cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--ink-primary)' : 'var(--bg-folio)',
                    color: active ? 'var(--bg-folio)' : 'var(--ink-slate)',
                    border: `1px solid ${active ? 'var(--ink-primary)' : 'var(--rule-strong)'}`,
                    borderRadius: '2px',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right Controls: SD Formula Toggle + Batch Paste + Add Row */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center h-[28px] p-0.5"
              style={{
                backgroundColor: 'var(--bg-folio)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '2px',
              }}
              role="group"
              aria-label="Standard deviation denominator formula"
            >
              <span
                className="px-2 text-[10px] font-medium uppercase tracking-[0.08em] hidden sm:inline"
                style={{ color: 'var(--ink-muted)' }}
              >
                SD Formula
              </span>
              <button
                type="button"
                onClick={() => onSdModeChange('sample')}
                className="h-[22px] px-2 text-[10.5px] font-medium uppercase tracking-[0.06em] cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: sdMode === 'sample' ? 'var(--ink-primary)' : 'transparent',
                  color: sdMode === 'sample' ? 'var(--bg-folio)' : 'var(--ink-slate)',
                  borderRadius: '1px',
                }}
              >
                Sample (N−1)
              </button>
              <button
                type="button"
                onClick={() => onSdModeChange('population')}
                className="h-[22px] px-2 text-[10.5px] font-medium uppercase tracking-[0.06em] cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: sdMode === 'population' ? 'var(--ink-primary)' : 'transparent',
                  color: sdMode === 'population' ? 'var(--bg-folio)' : 'var(--ink-slate)',
                  borderRadius: '1px',
                }}
              >
                Pop (N)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPasteOpen((o) => !o)}
              aria-expanded={pasteOpen}
              className="h-[28px] px-2.5 inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: pasteOpen ? 'var(--tint-cobalt)' : 'var(--bg-folio)',
                color: pasteOpen ? 'var(--ink-cobalt)' : 'var(--ink-primary)',
                border: `1px solid ${pasteOpen ? 'var(--ink-cobalt)' : 'var(--rule-strong)'}`,
                borderRadius: '2px',
              }}
            >
              <ClipboardPaste className="w-3 h-3" strokeWidth={1.8} aria-hidden="true" />
              <span>Batch Paste Table</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onAddRow();
              }}
              className="h-[28px] px-2.5 inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] whitespace-nowrap cursor-pointer transition-colors hover:bg-[#ECE8DE]"
              style={{
                backgroundColor: 'var(--bg-folio)',
                color: 'var(--ink-primary)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '2px',
              }}
            >
              <Plus className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
              <span>Add Row</span>
            </button>

            <button
              type="button"
              onClick={onResetSpecimen}
              title="Restore active preset specimen"
              aria-label="Restore active preset specimen"
              className="h-[28px] w-[28px] inline-flex items-center justify-center cursor-pointer transition-colors hover:bg-[#ECE8DE]"
              style={{
                backgroundColor: 'var(--bg-folio)',
                color: 'var(--ink-slate)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '2px',
              }}
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Collapsible Batch Paste Drawer */}
        {pasteOpen && (
          <div
            className="px-4 py-3"
            style={{
              backgroundColor: 'var(--bg-folio)',
              borderTop: '1px solid var(--rule-hairline)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <span className="micro-label" style={{ color: 'var(--ink-primary)' }}>
                  Batch Table Intake — Paste from Journal PDF or Spreadsheet
                </span>
                <span className="ml-2 text-[11px]" style={{ color: 'var(--ink-slate)' }}>
                  Format: <span className="mono-num">Label, Mean, SD, N [, Items]</span> (tab, comma, or space delimited)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPasteText(SAMPLE_PASTE_TEXT)}
                  className="text-[10.5px] font-medium uppercase tracking-[0.08em] underline cursor-pointer"
                  style={{ color: 'var(--ink-cobalt)' }}
                >
                  Insert Sample
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  aria-label="Close batch paste drawer"
                  className="w-6 h-6 inline-flex items-center justify-center cursor-pointer"
                  style={{ color: 'var(--ink-slate)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder="e.g.&#10;Control Group	4.25	1.13	16&#10;Treatment Group	5.19	1.42	12"
              aria-label="Paste table rows for GRIM and GRIMMER audit"
              className="w-full p-2.5 mono-num text-[12px] leading-relaxed resize-y"
              style={{
                backgroundColor: 'var(--bg-ground)',
                color: 'var(--ink-primary)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '2px',
              }}
            />

            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="mono-num text-[11px]" style={{ color: 'var(--ink-slate)' }}>
                {pastePreviewRows.length > 0
                  ? `${pastePreviewRows.length} valid numeric row${pastePreviewRows.length === 1 ? '' : 's'} detected`
                  : 'Waiting for numeric rows (Mean, SD, N)...'}
              </span>
              <button
                type="button"
                disabled={pastePreviewRows.length === 0}
                onClick={handleApplyPaste}
                className="h-[30px] px-3.5 text-[11px] font-medium uppercase tracking-[0.09em] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--ink-primary)',
                  color: 'var(--bg-folio)',
                  borderRadius: '2px',
                }}
              >
                Run Audit ({pastePreviewRows.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Split-Pane Workbench: Left 54% Forensic Ledger | Right 46% Precision Caliper Folio */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane: Interactive Forensic Audit Table */}
        <section
          aria-label="Forensic table audit ledger"
          className="lg:w-[54%] flex flex-col min-h-0 overflow-hidden"
          style={{
            borderRight: '1px solid var(--rule-hairline)',
            backgroundColor: 'var(--bg-ground)',
          }}
        >
          <div
            className="px-4 py-2.5 shrink-0 flex items-baseline justify-between gap-3"
            style={{ borderBottom: '1px solid var(--rule-hairline)' }}
          >
            <div className="min-w-0">
              <h1
                className="font-editorial text-[22px] leading-tight truncate"
                style={{ color: 'var(--ink-primary)' }}
              >
                {specimenTitle}
              </h1>
              <p className="text-[11.5px] m-0 mt-0.5 truncate" style={{ color: 'var(--ink-slate)' }}>
                {specimenSubtitle} · Click any cell to edit live
              </p>
            </div>
            <span className="mono-num text-[10px] whitespace-nowrap shrink-0" style={{ color: 'var(--ink-muted)' }}>
              PRECISION PRESERVED
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-left table-fixed min-w-[600px]">
              <thead className="sticky top-0 z-10">
                <tr
                  style={{
                    backgroundColor: 'var(--bg-folio)',
                    borderBottom: '1px solid var(--rule-strong)',
                  }}
                >
                  <th className="py-2 pl-3.5 pr-2 micro-label w-[34%]" style={{ color: 'var(--ink-slate)' }}>
                    Variable / Condition
                  </th>
                  <th className="py-2 px-1.5 micro-label text-right w-[68px]" style={{ color: 'var(--ink-slate)' }}>
                    Mean
                  </th>
                  <th className="py-2 px-1.5 micro-label text-right w-[66px]" style={{ color: 'var(--ink-slate)' }}>
                    SD
                  </th>
                  <th className="py-2 px-1.5 micro-label text-right w-[46px]" style={{ color: 'var(--ink-slate)' }}>
                    N
                  </th>
                  <th className="py-2 px-1 micro-label text-right w-[34px]" style={{ color: 'var(--ink-slate)' }}>
                    k
                  </th>
                  <th className="py-2 px-1.5 micro-label text-right w-[50px]" style={{ color: 'var(--ink-slate)' }}>
                    Sum S
                  </th>
                  <th className="py-2 pl-1.5 pr-2 micro-label text-right w-[144px]" style={{ color: 'var(--ink-slate)' }}>
                    Verdict
                  </th>
                  <th className="py-2 pr-1.5 w-[26px]" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {filteredAudits.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-[12.5px]"
                      style={{ color: 'var(--ink-slate)' }}
                    >
                      No rows match the active filter.
                    </td>
                  </tr>
                ) : (
                  filteredAudits.map((audit) => {
                    const isSelected = selectedAudit?.input.id === audit.input.id;
                    const row = audit.input;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        data-testid={`audit-row-${row.id}`}
                        className="group cursor-pointer transition-colors"
                        style={{
                          backgroundColor: isSelected ? 'var(--bg-folio)' : 'transparent',
                          borderBottom: '1px solid var(--rule-hairline)',
                          boxShadow: isSelected ? 'inset 2.5px 0 0 0 var(--ink-cobalt)' : undefined,
                        }}
                      >
                        <td className="py-2 pl-3.5 pr-1.5" title={row.label}>
                          <input
                            type="text"
                            value={row.label}
                            title={row.label}
                            onFocus={() => setSelectedId(row.id)}
                            onChange={(e) => onUpdateRow(row.id, { label: e.target.value })}
                            aria-label={`Row label for ${row.label}`}
                            className="w-full bg-transparent text-[12.5px] font-medium px-1 py-0.5 truncate border border-transparent hover:border-[#DCD6CA] focus:border-[#1D4ED8] focus:bg-[#FAF8F4]"
                            style={{ color: 'var(--ink-primary)', borderRadius: '1px' }}
                          />
                        </td>

                        <td className="py-2 px-1.5 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.meanStr}
                            onFocus={() => setSelectedId(row.id)}
                            onChange={(e) => onUpdateRow(row.id, { meanStr: e.target.value })}
                            aria-label={`Mean for ${row.label}`}
                            className="w-full text-right mono-num text-[12.5px] px-1.5 py-0.5 bg-transparent border border-transparent hover:border-[#DCD6CA] focus:border-[#1D4ED8] focus:bg-[#FAF8F4]"
                            style={{
                              color:
                                audit.status === 'GRIM IMPOSSIBLE'
                                  ? 'var(--ink-vermilion)'
                                  : 'var(--ink-primary)',
                              fontWeight: audit.status === 'GRIM IMPOSSIBLE' ? 600 : 500,
                              borderRadius: '1px',
                            }}
                          />
                        </td>

                        <td className="py-2 px-1.5 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.sdStr}
                            onFocus={() => setSelectedId(row.id)}
                            onChange={(e) => onUpdateRow(row.id, { sdStr: e.target.value })}
                            aria-label={`SD for ${row.label}`}
                            placeholder="—"
                            className="w-full text-right mono-num text-[12.5px] px-1.5 py-0.5 bg-transparent border border-transparent hover:border-[#DCD6CA] focus:border-[#1D4ED8] focus:bg-[#FAF8F4]"
                            style={{
                              color:
                                audit.status === 'GRIMMER IMPOSSIBLE'
                                  ? 'var(--ink-vermilion)'
                                  : 'var(--ink-primary)',
                              fontWeight: audit.status === 'GRIMMER IMPOSSIBLE' ? 600 : 400,
                              borderRadius: '1px',
                            }}
                          />
                        </td>

                        <td className="py-2 px-1.5 text-right">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={row.n}
                            onFocus={() => setSelectedId(row.id)}
                            onChange={(e) => {
                              const parsed = Number.parseInt(e.target.value, 10);
                              onUpdateRow(row.id, { n: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
                            }}
                            aria-label={`Sample size N for ${row.label}`}
                            className="w-full text-right mono-num text-[12.5px] px-1 py-0.5 bg-transparent border border-transparent hover:border-[#DCD6CA] focus:border-[#1D4ED8] focus:bg-[#FAF8F4]"
                            style={{ color: 'var(--ink-primary)', borderRadius: '1px' }}
                          />
                        </td>

                        <td className="py-2 px-1.5 text-right">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            step={1}
                            value={row.items}
                            onFocus={() => setSelectedId(row.id)}
                            onChange={(e) => {
                              const parsed = Number.parseInt(e.target.value, 10);
                              onUpdateRow(row.id, {
                                items: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
                              });
                            }}
                            aria-label={`Items per scale k for ${row.label}`}
                            className="w-full text-right mono-num text-[12px] px-1 py-0.5 bg-transparent border border-transparent hover:border-[#DCD6CA] focus:border-[#1D4ED8] focus:bg-[#FAF8F4]"
                            style={{ color: 'var(--ink-slate)', borderRadius: '1px' }}
                          />
                        </td>

                        <td
                          className="py-2 px-2 text-right mono-num text-[12px] whitespace-nowrap"
                          style={{ color: 'var(--ink-slate)' }}
                        >
                          {audit.grim.applicable && audit.grim.impliedSum !== null
                            ? audit.grim.impliedSum
                            : '—'}
                        </td>

                        <td className="py-2 pl-2 pr-2 text-right">
                          <VerdictStamp
                            verdict={audit.status}
                            size="sm"
                            animateKey={`${row.id}-${row.meanStr}-${row.sdStr}-${row.n}-${row.items}-${sdMode}`}
                          />
                        </td>

                        <td className="py-2 pr-2 text-right">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRow(row.id);
                              }}
                              aria-label={`Delete row ${row.label}`}
                              className="w-6 h-6 inline-flex items-center justify-center opacity-35 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer transition-opacity hover:text-[#C62828]"
                              style={{ color: 'var(--ink-slate)' }}
                            >
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Pane: Precision Vernier Caliper & Proof Folio */}
        <section
          ref={inspectorPaneRef}
          aria-label="Precision Vernier caliper and mathematical proof"
          className="lg:w-[46%] flex flex-col min-h-0 overflow-y-auto p-3.5 lg:p-4"
          style={{ backgroundColor: 'var(--bg-ground)' }}
        >
          {selectedAudit ? (
            <div className="space-y-3">
              {/* Folio Header */}
              <div
                className="p-3.5"
                style={{
                  backgroundColor: 'var(--bg-folio)',
                  border: '1px solid var(--rule-hairline)',
                  borderRadius: '2px',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="micro-label" style={{ color: 'var(--ink-slate)' }}>
                      Active Specimen Row
                    </div>
                    <h2
                      className="font-editorial text-[26px] leading-[1.12] mt-0.5"
                      style={{ color: 'var(--ink-primary)' }}
                      data-testid="active-folio-title"
                    >
                      {selectedAudit.input.label}
                    </h2>
                  </div>
                  <VerdictStamp
                    verdict={selectedAudit.status}
                    size="md"
                    animateKey={`folio-${selectedAudit.input.id}-${selectedAudit.input.meanStr}-${selectedAudit.input.sdStr}-${selectedAudit.input.n}-${selectedAudit.input.items}-${sdMode}`}
                  />
                </div>

                <p
                  className="mt-2.5 text-[12.5px] leading-relaxed m-0"
                  style={{ color: 'var(--ink-primary)' }}
                  data-testid="active-folio-summary"
                >
                  {selectedAudit.executiveSummary}
                </p>

                <div
                  className="mt-3 pt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 mono-num text-[11px]"
                  style={{
                    borderTop: '1px solid var(--rule-hairline)',
                    color: 'var(--ink-slate)',
                  }}
                >
                  <span>M = {selectedAudit.input.meanStr || '—'}</span>
                  <span>SD = {selectedAudit.input.sdStr || '—'}</span>
                  <span>N = {selectedAudit.input.n}</span>
                  <span>k = {selectedAudit.input.items}</span>
                  <span>{sdMode === 'sample' ? 'Sample SD (N−1)' : 'Pop SD (N)'}</span>
                </div>
              </div>

              {/* Bespoke Twin-Axis Vernier Calipers + Proof Trace */}
              <VernierCaliperSvg audit={selectedAudit} />
            </div>
          ) : (
            <div
              className="flex-1 flex items-center justify-center text-[13px]"
              style={{ color: 'var(--ink-slate)' }}
            >
              Select a row from the ledger to inspect its GRIM &amp; GRIMMER Vernier calipers.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
