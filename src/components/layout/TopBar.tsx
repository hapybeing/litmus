import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FolderOpen, Lock, Upload } from 'lucide-react';
import type { LabMode, TableSpecimen } from '../../types/forensics';

interface TopBarProps {
  activeMode: LabMode;
  onModeChange: (mode: LabMode) => void;
  specimenName: string;
  specimenCountLabel: string;
  sha256Short: string;
  tableSpecimens: TableSpecimen[];
  activeSpecimenId: string;
  isCaseFile01Active: boolean;
  onSelectCaseFile01: () => void;
  onSelectTableSpecimen: (id: string) => void;
  onUploadFile: (file: File) => void;
  onExportDossier: () => void;
  exportCopied: boolean;
}

const MODE_TABS: Array<{ id: LabMode; num: string; label: string }> = [
  { id: 'manuscript', num: '01', label: 'MANUSCRIPT' },
  { id: 'table', num: '02', label: 'TABLE CHECK' },
  { id: 'multiverse', num: '03', label: 'MULTIVERSE & DATA' },
];

export function TopBar({
  activeMode,
  onModeChange,
  specimenName,
  specimenCountLabel,
  sha256Short,
  tableSpecimens,
  activeSpecimenId,
  isCaseFile01Active,
  onSelectCaseFile01,
  onSelectTableSpecimen,
  onUploadFile,
  onExportDossier,
  exportCopied,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  return (
    <header
      className="h-[48px] shrink-0 flex items-center justify-between gap-2.5 px-3.5 select-none relative z-30"
      style={{
        backgroundColor: 'var(--bg-folio)',
        borderBottom: '1px solid var(--rule-hairline)',
      }}
    >
      {/* Left: Masthead + Mode Switcher */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-baseline gap-2 shrink-0 pr-0.5">
          <span
            className="font-editorial text-[23px] leading-none tracking-[-0.015em]"
            style={{ color: 'var(--ink-primary)' }}
          >
            LITMUS
          </span>
          <span
            className="hidden 2xl:inline text-[9.5px] font-medium uppercase tracking-[0.14em]"
            style={{ color: 'var(--ink-slate)' }}
          >
            FORENSIC BENCH
          </span>
        </div>

        <div
          className="h-5 w-px shrink-0"
          style={{ backgroundColor: 'var(--rule-hairline)' }}
          aria-hidden="true"
        />

        <nav
          role="tablist"
          aria-label="Forensic Laboratories"
          className="flex items-center h-[48px] gap-0.5 shrink-0"
        >
          {MODE_TABS.map((tab) => {
            const isActive = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onModeChange(tab.id)}
                className="relative h-full px-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] uppercase whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                style={{
                  color: isActive ? 'var(--ink-primary)' : 'var(--ink-slate)',
                }}
              >
                <span
                  className="mono-num text-[10px]"
                  style={{
                    color: isActive ? 'var(--ink-cobalt)' : 'var(--ink-muted)',
                  }}
                >
                  {tab.num}
                </span>
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    className="absolute left-0 right-0 bottom-0 h-[2px]"
                    style={{ backgroundColor: 'var(--ink-primary)' }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Center: Active Specimen Strip (Architectural hairline plate, zero pills) */}
      <div
        className="hidden lg:flex items-center gap-2 px-2.5 h-[30px] min-w-0 shrink overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-ground)',
          border: '1px solid var(--rule-hairline)',
          borderRadius: '2px',
        }}
        title={`${specimenName} · ${specimenCountLabel} · SHA-256 ${sha256Short}`}
      >
        <span
          className="text-[11.5px] font-medium truncate max-w-[125px] xl:max-w-[170px]"
          style={{ color: 'var(--ink-primary)' }}
        >
          {specimenName}
        </span>
        <span className="hidden xl:inline" style={{ color: 'var(--rule-strong)' }} aria-hidden="true">
          ·
        </span>
        <span
          className="hidden xl:inline mono-num text-[10.5px] whitespace-nowrap shrink-0"
          style={{ color: 'var(--ink-slate)' }}
        >
          {specimenCountLabel}
        </span>
        <span style={{ color: 'var(--rule-strong)' }} aria-hidden="true">
          ·
        </span>
        <span
          className="mono-num text-[10.5px] whitespace-nowrap shrink-0"
          style={{ color: 'var(--ink-slate)' }}
          data-testid="specimen-sha256"
        >
          SHA {sha256Short}
        </span>
        <span style={{ color: 'var(--rule-strong)' }} aria-hidden="true">
          ·
        </span>
        <span
          className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.09em] whitespace-nowrap shrink-0"
          style={{ color: 'var(--ink-forest)' }}
        >
          <Lock className="w-2.5 h-2.5" strokeWidth={2.2} aria-hidden="true" />
          LOCAL ONLY
        </span>
      </div>

      {/* Right: Case Files Menu + Export Dossier */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="h-[30px] px-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            style={{
              backgroundColor: menuOpen ? 'var(--bg-inset)' : 'var(--bg-folio)',
              color: 'var(--ink-primary)',
              border: '1px solid var(--rule-strong)',
              borderRadius: '2px',
            }}
          >
            <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Case Files</span>
            <ChevronDown className="w-3 h-3" strokeWidth={1.75} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Forensic Case Files"
              className="absolute right-0 mt-1.5 w-[355px] z-50"
              style={{
                backgroundColor: 'var(--bg-folio)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '2px',
                boxShadow: '0 6px 18px rgba(20, 20, 18, 0.08)',
              }}
            >
              <div
                className="px-3 py-2 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--rule-hairline)' }}
              >
                <span className="micro-label" style={{ color: 'var(--ink-slate)' }}>
                  Archival Specimens
                </span>
                <span className="mono-num text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                  100% LOCAL
                </span>
              </div>

              <div className="py-1">
                {/* Active Case File 01: Manuscript Audit PDF */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectCaseFile01();
                    onModeChange('manuscript');
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 flex items-start justify-between gap-2 cursor-pointer transition-colors hover:bg-[#F4F1EA]"
                  style={{
                    backgroundColor:
                      activeMode === 'manuscript' && isCaseFile01Active
                        ? 'var(--tint-cobalt)'
                        : undefined,
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="mono-num text-[10px] font-medium"
                        style={{ color: 'var(--ink-cobalt)' }}
                      >
                        CASE 01
                      </span>
                      <span
                        className="text-[12px] font-medium truncate"
                        style={{ color: 'var(--ink-primary)' }}
                      >
                        Attention Restoration Pre-Print (PDF)
                      </span>
                    </div>
                    <p
                      className="text-[11px] mt-0.5 leading-snug"
                      style={{ color: 'var(--ink-slate)' }}
                    >
                      3-page PDF · 8 inline tests (2 decision flips, 1 drift, N-drop) + Table 1
                    </p>
                  </div>
                  {activeMode === 'manuscript' && isCaseFile01Active && (
                    <Check
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: 'var(--ink-cobalt)' }}
                      aria-hidden="true"
                    />
                  )}
                </button>

                <div
                  className="my-1 mx-3 h-px"
                  style={{ backgroundColor: 'var(--rule-hairline)' }}
                />

                {/* Active Table Specimens */}
                {tableSpecimens.map((spec) => {
                  const selected = activeMode === 'table' && activeSpecimenId === spec.id;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectTableSpecimen(spec.id);
                        onModeChange('table');
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 flex items-start justify-between gap-2 cursor-pointer transition-colors hover:bg-[#F4F1EA]"
                      style={{
                        backgroundColor: selected ? 'var(--tint-cobalt)' : undefined,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="mono-num text-[10px] font-medium"
                            style={{ color: 'var(--ink-cobalt)' }}
                          >
                            {spec.code}
                          </span>
                          <span
                            className="text-[12px] font-medium truncate"
                            style={{ color: 'var(--ink-primary)' }}
                          >
                            {spec.title}
                          </span>
                        </div>
                        <p
                          className="text-[11px] mt-0.5 leading-snug"
                          style={{ color: 'var(--ink-slate)' }}
                        >
                          {spec.sourceNote}
                        </p>
                      </div>
                      {selected && (
                        <Check
                          className="w-3.5 h-3.5 shrink-0 mt-0.5"
                          style={{ color: 'var(--ink-cobalt)' }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}

                <div
                  className="my-1 mx-3 h-px"
                  style={{ backgroundColor: 'var(--rule-hairline)' }}
                />

                {/* Phase 3 Specimen Staging */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onModeChange('multiverse');
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 flex items-start justify-between gap-2 cursor-pointer hover:bg-[#F4F1EA]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="mono-num text-[10px]"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        CASE 03
                      </span>
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: 'var(--ink-slate)' }}
                      >
                        Policy Multiverse &amp; Field Survey CSV
                      </span>
                    </div>
                    <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                      Phase 3 · Specification Curve + Benford Forensics
                    </p>
                  </div>
                </button>
              </div>

              <div
                className="p-2"
                style={{
                  borderTop: '1px solid var(--rule-hairline)',
                  backgroundColor: 'var(--bg-ground)',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.csv,.tsv,.txt,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadFile(file);
                      setMenuOpen(false);
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[30px] px-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] cursor-pointer transition-colors hover:bg-[#FAF8F4]"
                  style={{
                    color: 'var(--ink-primary)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: '2px',
                  }}
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Upload Local PDF / CSV / TSV</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onExportDossier}
          className="h-[30px] px-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          style={{
            backgroundColor: exportCopied ? 'var(--ink-forest)' : 'var(--ink-primary)',
            color: 'var(--bg-folio)',
            border: `1px solid ${exportCopied ? 'var(--ink-forest)' : 'var(--ink-primary)'}`,
            borderRadius: '2px',
          }}
        >
          {exportCopied ? (
            <>
              <Check className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Copied Markdown</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span>Export Dossier</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
