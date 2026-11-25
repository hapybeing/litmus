import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LabMode, SdFormulaMode, TableRowInput } from './types/forensics';
import { TABLE_SPECIMENS } from './data/tableSpecimens';
import { auditTableRow, formatTableAuditMarkdown, parseBatchTableText } from './engine/grim';
import { runKernelSelfTest } from './engine/selfTest';
import { computeSha256Fingerprint } from './engine/cryptoHash';
import { TopBar } from './components/layout/TopBar';
import { BottomRail, SelfCheckModal } from './components/layout/BottomRail';
import { DropCurtain } from './components/layout/DropCurtain';
import { StagingPlate } from './components/layout/StagingPlate';
import { TableImpossibilityLab } from './components/tables/TableImpossibilityLab';

export default function App() {
  const [activeMode, setActiveMode] = useState<LabMode>('table');
  const [activeSpecimenId, setActiveSpecimenId] = useState<string>(TABLE_SPECIMENS[0].id);
  const [customSpecimenTitle, setCustomSpecimenTitle] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<TableRowInput[]>(() =>
    TABLE_SPECIMENS[0].rows.map((r) => ({ ...r }))
  );
  const [sdMode, setSdMode] = useState<SdFormulaMode>(TABLE_SPECIMENS[0].sdMode);
  const [sha256Short, setSha256Short] = useState<string>('COMPUTING');
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

  const specimenTitle = customSpecimenTitle ?? activePreset.title;
  const specimenSubtitle = customSpecimenTitle
    ? 'Imported Local Table · Zero-Upload Browser Audit'
    : activePreset.subtitle;

  // Live GRIM & GRIMMER audits across all rows
  const tableAudits = useMemo(
    () => tableRows.map((row) => auditTableRow(row, sdMode)),
    [tableRows, sdMode]
  );

  // Compute real WebCrypto SHA-256 fingerprint whenever specimen data changes
  useEffect(() => {
    let cancelled = false;
    const canonicalPayload = JSON.stringify({
      title: specimenTitle,
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
      if (!cancelled) setSha256Short(shortHash);
    });

    return () => {
      cancelled = true;
    };
  }, [specimenTitle, sdMode, tableRows]);

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

  const handleIngestFile = useCallback((file: File) => {
    const lower = file.name.toLowerCase();
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
    } else if (lower.endsWith('.pdf')) {
      setActiveMode('manuscript');
    }
  }, []);

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
    const md = formatTableAuditMarkdown(specimenTitle, sha256Short, sdMode, tableAudits);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(md).catch(() => {
        // Fallback silent copy if iframe blocks clipboard API
      });
    }
    setExportCopied(true);
    window.setTimeout(() => setExportCopied(false), 2000);
  }, [specimenTitle, sha256Short, sdMode, tableAudits]);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-ground)', color: 'var(--ink-primary)' }}
    >
      <TopBar
        activeMode={activeMode}
        onModeChange={setActiveMode}
        specimenName={specimenTitle}
        specimenCountLabel={`${tableRows.length} ROWS`}
        sha256Short={sha256Short}
        tableSpecimens={TABLE_SPECIMENS}
        activeSpecimenId={activeSpecimenId}
        onSelectTableSpecimen={handleSelectTableSpecimen}
        onUploadFile={handleIngestFile}
        onExportDossier={handleExportDossier}
        exportCopied={exportCopied}
      />

      {activeMode === 'table' ? (
        <TableImpossibilityLab
          specimenTitle={specimenTitle}
          specimenSubtitle={specimenSubtitle}
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
          mode={activeMode}
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
