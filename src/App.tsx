import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  LabMode,
  ManuscriptAuditResult,
  SdFormulaMode,
  TableRowInput,
} from './types/forensics';
import { TABLE_SPECIMENS } from './data/tableSpecimens';
import { CASE_FILE_01_FILENAME, generateCaseFile01Pdf } from './data/specimenPdf';
import { auditTableRow, formatTableAuditMarkdown, parseBatchTableText } from './engine/grim';
import {
  auditPdfDocument,
  formatManuscriptAuditMarkdown,
  loadPdfDocument,
} from './engine/pdfExtractor';
import { runKernelSelfTest } from './engine/selfTest';
import { computeSha256Fingerprint } from './engine/cryptoHash';
import { TopBar } from './components/layout/TopBar';
import { BottomRail, SelfCheckModal } from './components/layout/BottomRail';
import { DropCurtain } from './components/layout/DropCurtain';
import { StagingPlate } from './components/layout/StagingPlate';
import { TableImpossibilityLab } from './components/tables/TableImpossibilityLab';
import { ManuscriptLab } from './components/manuscript/ManuscriptLab';

function disposePdfDoc(doc: PDFDocumentProxy | null): void {
  if (!doc) return;
  const maybeDestroyable = doc as PDFDocumentProxy & { destroy?: () => Promise<void> };
  if (typeof maybeDestroyable.destroy === 'function') {
    maybeDestroyable.destroy().catch(() => {});
  } else if (typeof doc.cleanup === 'function') {
    doc.cleanup().catch(() => {});
  }
}

export default function App() {
  const [activeMode, setActiveMode] = useState<LabMode>('manuscript');

  // Lab 01 (Manuscript PDF Audit) state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [manuscriptAudit, setManuscriptAudit] = useState<ManuscriptAuditResult | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isCaseFile01Active, setIsCaseFile01Active] = useState<boolean>(true);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pdfLoadSeqRef = useRef<number>(0);

  // Lab 02 (Table Impossibility Lab) state
  const [activeSpecimenId, setActiveSpecimenId] = useState<string>(TABLE_SPECIMENS[0].id);
  const [customSpecimenTitle, setCustomSpecimenTitle] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<TableRowInput[]>(() =>
    TABLE_SPECIMENS[0].rows.map((r) => ({ ...r }))
  );
  const [sdMode, setSdMode] = useState<SdFormulaMode>(TABLE_SPECIMENS[0].sdMode);
  const [tableSha256Short, setTableSha256Short] = useState<string>('COMPUTING');

  // Shared UI chrome state
  const [selfTestOpen, setSelfTestOpen] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const dragCounterRef = useRef(0);

  // Deterministic startup self-verification (< 2ms, zero side effects)
  const selfTestReport = useMemo(() => runKernelSelfTest(), []);

  const activePreset = useMemo(
    () => TABLE_SPECIMENS.find((s) => s.id === activeSpecimenId) ?? TABLE_SPECIMENS[0],
    [activeSpecimenId]
  );

  const tableSpecimenTitle = customSpecimenTitle ?? activePreset.title;
  const tableSpecimenSubtitle = customSpecimenTitle
    ? 'Imported Local Table · Zero-Upload Browser Audit'
    : activePreset.subtitle;

  // Live GRIM & GRIMMER audits across all Lab 02 rows
  const tableAudits = useMemo(
    () => tableRows.map((row) => auditTableRow(row, sdMode)),
    [tableRows, sdMode]
  );

  // Unified PDF loading pipeline (identical for Case File 01 and user-uploaded PDFs)
  const ingestPdfBytes = useCallback(
    async (bytes: Uint8Array, fileName: string, isBuiltinCase01: boolean) => {
      const seq = ++pdfLoadSeqRef.current;
      setPdfLoading(true);
      setPdfError(null);

      try {
        const nextDoc = await loadPdfDocument(bytes);
        if (seq !== pdfLoadSeqRef.current) {
          disposePdfDoc(nextDoc);
          return;
        }

        const result = await auditPdfDocument(nextDoc, bytes, fileName);
        if (seq !== pdfLoadSeqRef.current) {
          disposePdfDoc(nextDoc);
          return;
        }

        const prevDoc = pdfDocRef.current;
        pdfDocRef.current = nextDoc;
        setPdfDoc(nextDoc);
        setManuscriptAudit(result);
        setIsCaseFile01Active(isBuiltinCase01);
        setPdfLoading(false);

        if (prevDoc && prevDoc !== nextDoc) {
          disposePdfDoc(prevDoc);
        }
      } catch (err) {
        if (seq !== pdfLoadSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Unable to parse PDF document.';
        setPdfError(msg);
        setPdfLoading(false);
      }
    },
    []
  );

  const handleLoadCaseFile01 = useCallback(() => {
    const bytes = generateCaseFile01Pdf();
    void ingestPdfBytes(bytes, CASE_FILE_01_FILENAME, true);
  }, [ingestPdfBytes]);

  // Auto-load Case File 01 on mount through the live pdfjs-dist extraction pipeline
  useEffect(() => {
    handleLoadCaseFile01();
    return () => {
      if (pdfDocRef.current) {
        disposePdfDoc(pdfDocRef.current);
        pdfDocRef.current = null;
      }
    };
  }, [handleLoadCaseFile01]);

  // Compute real WebCrypto SHA-256 fingerprint whenever Lab 02 table specimen changes
  useEffect(() => {
    let cancelled = false;
    const canonicalPayload = JSON.stringify({
      title: tableSpecimenTitle,
      sdMode,
      rows: tableRows.map(({ label, meanStr, sdStr, n, items }) => [
        label,
        meanStr,
        sdStr,
        n,
        items,
      ]),
    });

    computeSha256Fingerprint(canonicalPayload).then(({ shortHash }) => {
      if (!cancelled) setTableSha256Short(shortHash);
    });

    return () => {
      cancelled = true;
    };
  }, [tableSpecimenTitle, sdMode, tableRows]);

  const handleSelectTableSpecimen = useCallback((id: string) => {
    const spec = TABLE_SPECIMENS.find((s) => s.id === id);
    if (!spec) return;
    setActiveSpecimenId(spec.id);
    setCustomSpecimenTitle(null);
    setTableRows(spec.rows.map((r) => ({ ...r })));
    setSdMode(spec.sdMode);
  }, []);

  const handleResetSpecimen = useCallback(() => {
    setCustomSpecimenTitle(null);
    setTableRows(activePreset.rows.map((r) => ({ ...r })));
    setSdMode(activePreset.sdMode);
  }, [activePreset]);

  const handleUpdateRow = useCallback((id: string, patch: Partial<TableRowInput>) => {
    setTableRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const handleAddRow = useCallback(() => {
    const idx = tableRows.length + 1;
    const newRow: TableRowInput = {
      id: `custom-${Date.now()}-${idx}`,
      label: `Measure ${idx}`,
      meanStr: '4.15',
      sdStr: '1.12',
      n: 14,
      items: 1,
    };
    setTableRows((prev) => [...prev, newRow]);
  }, [tableRows.length]);

  const handleDeleteRow = useCallback((id: string) => {
    setTableRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  const handleReplaceRows = useCallback((newRows: TableRowInput[], title?: string) => {
    if (newRows.length === 0) return;
    setTableRows(newRows);
    setCustomSpecimenTitle(title ?? 'Imported Local Table');
  }, []);

  const handleSendTablesToLab02 = useCallback(() => {
    if (!manuscriptAudit || manuscriptAudit.extractedTableRows.length === 0) return;
    setTableRows(manuscriptAudit.extractedTableRows.map((r) => ({ ...r })));
    setCustomSpecimenTitle(`${manuscriptAudit.fileName} — Extracted Table`);
    setSdMode('sample');
    setActiveMode('table');
  }, [manuscriptAudit]);

  const handleUploadPdfFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          setActiveMode('manuscript');
          void ingestPdfBytes(new Uint8Array(reader.result), file.name, false);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [ingestPdfBytes]
  );

  const handleIngestFile = useCallback(
    (file: File) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        handleUploadPdfFile(file);
        return;
      }
      if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = () => {
          const text = typeof reader.result === 'string' ? reader.result : '';
          const parsed = parseBatchTableText(text);
          if (parsed.length > 0) {
            setTableRows(parsed);
            setCustomSpecimenTitle(file.name);
            setActiveMode('table');
          }
        };
        reader.readAsText(file);
      }
    },
    [handleUploadPdfFile]
  );

  // Global window drag-and-drop overlay
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDraggingFile(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDraggingFile(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        handleIngestFile(file);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleIngestFile]);

  // Global 1 / 2 / 3 lab switching when not typing in an input
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1') setActiveMode('manuscript');
      else if (e.key === '2') setActiveMode('table');
      else if (e.key === '3') setActiveMode('multiverse');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleExportDossier = useCallback(() => {
    const md =
      activeMode === 'manuscript' && manuscriptAudit
        ? formatManuscriptAuditMarkdown(manuscriptAudit)
        : formatTableAuditMarkdown(tableSpecimenTitle, tableSha256Short, sdMode, tableAudits);

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(md).catch(() => {
        // Silent fallback if clipboard API is restricted
      });
    }
    setExportCopied(true);
    window.setTimeout(() => setExportCopied(false), 2000);
  }, [activeMode, manuscriptAudit, tableSpecimenTitle, tableSha256Short, sdMode, tableAudits]);

  // Dynamic TopBar specimen telemetry matching the active lab
  const topBarSpecimenName =
    activeMode === 'manuscript'
      ? (manuscriptAudit?.fileName ?? CASE_FILE_01_FILENAME)
      : tableSpecimenTitle;

  const topBarCountLabel =
    activeMode === 'manuscript'
      ? manuscriptAudit
        ? `${manuscriptAudit.pageCount} PP · ${manuscriptAudit.findings.length} TESTS`
        : 'LOADING PDF'
      : `${tableRows.length} ROWS`;

  const topBarSha =
    activeMode === 'manuscript'
      ? (manuscriptAudit?.sha256Short ?? 'HASHING')
      : tableSha256Short;

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      <TopBar
        activeMode={activeMode}
        onModeChange={setActiveMode}
        specimenName={topBarSpecimenName}
        specimenCountLabel={topBarCountLabel}
        sha256Short={topBarSha}
        tableSpecimens={TABLE_SPECIMENS}
        activeSpecimenId={activeSpecimenId}
        isCaseFile01Active={isCaseFile01Active}
        onSelectCaseFile01={handleLoadCaseFile01}
        onSelectTableSpecimen={handleSelectTableSpecimen}
        onUploadFile={handleIngestFile}
        onExportDossier={handleExportDossier}
        exportCopied={exportCopied}
      />

      {activeMode === 'manuscript' ? (
        <ManuscriptLab
          pdfDoc={pdfDoc}
          audit={manuscriptAudit}
          loading={pdfLoading}
          error={pdfError}
          onUploadPdf={handleUploadPdfFile}
          onLoadCaseFile01={handleLoadCaseFile01}
          onSendTablesToLab02={handleSendTablesToLab02}
        />
      ) : activeMode === 'table' ? (
        <TableImpossibilityLab
          specimenTitle={tableSpecimenTitle}
          specimenSubtitle={tableSpecimenSubtitle}
          rows={tableRows}
          audits={tableAudits}
          sdMode={sdMode}
          onSdModeChange={setSdMode}
          onUpdateRow={handleUpdateRow}
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onReplaceRows={handleReplaceRows}
          onResetSpecimen={handleResetSpecimen}
        />
      ) : (
        <StagingPlate
          mode="multiverse"
          selfTest={selfTestReport}
          onGoToTableLab={() => setActiveMode('table')}
          onOpenSelfTest={() => setSelfTestOpen(true)}
        />
      )}

      <BottomRail selfTest={selfTestReport} onOpenSelfTest={() => setSelfTestOpen(true)} />

      <SelfCheckModal
        open={selfTestOpen}
        report={selfTestReport}
        onClose={() => setSelfTestOpen(false)}
      />

      <DropCurtain visible={isDraggingFile} />
    </div>
  );
}
