import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ManuscriptAuditResult } from '../../types/forensics';
import { PdfViewport } from './PdfViewport';
import { ForensicLedger } from './ForensicLedger';

interface ManuscriptLabProps {
  pdfDoc: PDFDocumentProxy | null;
  audit: ManuscriptAuditResult | null;
  loading: boolean;
  error: string | null;
  onUploadPdf: (file: File) => void;
  onLoadCaseFile01: () => void;
  onSendTablesToLab02: () => void;
}

export function ManuscriptLab({
  pdfDoc,
  audit,
  loading,
  error,
  onUploadPdf,
  onLoadCaseFile01,
  onSendTablesToLab02,
}: ManuscriptLabProps) {
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);

  const findings = audit?.findings ?? [];

  // Default-select the first DECISION ERROR when a new manuscript audit finishes
  useEffect(() => {
    if (!audit || audit.findings.length === 0) {
      setSelectedFindingId(null);
      setInspectorOpen(false);
      return;
    }
    const firstError =
      audit.findings.find((f) => f.verdict === 'DECISION ERROR') ?? audit.findings[0];
    setSelectedFindingId(firstError.id);
    setInspectorOpen(true);
  }, [audit]);

  const handleSelectFinding = useCallback((id: string) => {
    setSelectedFindingId(id);
    setInspectorOpen(true);
  }, []);

  // Keyboard ↑ / ↓ stepping through findings + Esc to dismiss math inspector
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        setInspectorOpen(false);
        return;
      }

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && findings.length > 0) {
        e.preventDefault();
        const currIdx = findings.findIndex((f) => f.id === selectedFindingId);
        const nextIdx =
          e.key === 'ArrowDown'
            ? (currIdx + 1) % findings.length
            : (currIdx - 1 + findings.length) % findings.length;
        setSelectedFindingId(findings[nextIdx].id);
        setInspectorOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [findings, selectedFindingId]);

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div
          className="max-w-[520px] p-6"
          style={{
            backgroundColor: 'var(--bg-folio)',
            border: '1px solid var(--rule-vermilion)',
            borderRadius: '2px',
          }}
        >
          <div className="micro-label" style={{ color: 'var(--ink-vermilion)' }}>
            PDF ENGINE ERROR
          </div>
          <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
            {error}
          </p>
          <button
            type="button"
            onClick={onLoadCaseFile01}
            className="mt-4 h-[32px] px-3.5 text-[11px] font-medium uppercase tracking-[0.08em] cursor-pointer"
            style={{
              backgroundColor: 'var(--ink-primary)',
              color: 'var(--bg-folio)',
              borderRadius: '2px',
            }}
          >
            Reload Case File 01 Specimen
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
      <PdfViewport
        pdfDoc={pdfDoc}
        pageCount={audit?.pageCount ?? 0}
        findings={findings}
        selectedFindingId={selectedFindingId}
        onSelectFinding={handleSelectFinding}
        onUploadPdf={onUploadPdf}
        tablePages={audit?.extractedTablePages ?? []}
        loading={loading}
      />

      <ForensicLedger
        audit={audit}
        selectedFindingId={selectedFindingId}
        inspectorOpen={inspectorOpen}
        onSelectFinding={handleSelectFinding}
        onCloseInspector={() => setInspectorOpen(false)}
        onSendTablesToLab02={onSendTablesToLab02}
      />
    </main>
  );
}
