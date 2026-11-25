import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Maximize2, Minus, Plus, Upload } from 'lucide-react';
import type { PdfFinding } from '../../types/forensics';

interface PdfViewportProps {
  pdfDoc: PDFDocumentProxy | null;
  pageCount: number;
  findings: PdfFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  onUploadPdf: (file: File) => void;
  tablePages: number[];
  loading: boolean;
}

interface PageCanvasItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  findings: PdfFinding[];
  selectedFindingId: string | null;
  showHighlights: boolean;
  onSelectFinding: (id: string) => void;
  registerPageRef: (pageNum: number, el: HTMLDivElement | null) => void;
  registerHighlightRef: (findingId: string, el: HTMLButtonElement | null) => void;
}

function verdictHighlightPalette(verdict: PdfFinding['verdict'], selected: boolean) {
  if (selected) {
    return {
      bg: 'rgba(29, 78, 216, 0.16)',
      border: '#1D4ED8',
      borderWidth: 2,
    };
  }
  switch (verdict) {
    case 'DECISION ERROR':
      return {
        bg: 'rgba(198, 40, 40, 0.17)',
        border: '#C62828',
        borderWidth: 1.5,
      };
    case 'ROUNDING DRIFT':
      return {
        bg: 'rgba(179, 107, 0, 0.17)',
        border: '#B36B00',
        borderWidth: 1.5,
      };
    case 'VERIFIED':
      return {
        bg: 'rgba(22, 101, 52, 0.11)',
        border: '#166534',
        borderWidth: 1,
      };
  }
}

interface MappedRect {
  finding: PdfFinding;
  rectIdx: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  findings,
  selectedFindingId,
  showHighlights,
  onSelectFinding,
  registerPageRef,
  registerHighlightRef,
}: PageCanvasItemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }>({
    w: Math.round(612 * scale),
    h: Math.round(792 * scale),
  });
  const [mappedRects, setMappedRects] = useState<MappedRect[]>([]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function render() {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const cssViewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const hiDpiViewport = page.getViewport({ scale: scale * dpr });

      setPageDims({ w: cssViewport.width, h: cssViewport.height });

      // Transform PDF user-space bounding boxes into exact CSS viewport pixels
      const boxes: MappedRect[] = [];
      for (const f of findings) {
        f.rects.forEach((r, idx) => {
          const [vx1, vy1] = cssViewport.convertToViewportPoint(r.x1, r.y1);
          const [vx2, vy2] = cssViewport.convertToViewportPoint(r.x2, r.y2);
          const left = Math.min(vx1, vx2);
          const right = Math.max(vx1, vx2);
          const top = Math.min(vy1, vy2);
          const bottom = Math.max(vy1, vy2);
          boxes.push({
            finding: f,
            rectIdx: idx,
            left,
            top,
            width: Math.max(8, right - left),
            height: Math.max(10, bottom - top),
          });
        });
      }
      setMappedRects(boxes);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = Math.floor(hiDpiViewport.width);
      canvas.height = Math.floor(hiDpiViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;

      renderTask = page.render({
        canvasContext: ctx,
        viewport: hiDpiViewport,
        canvas,
      });

      try {
        await renderTask.promise;
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name !== 'RenderingCancelledException') {
          console.error(`PDF page ${pageNumber} render error:`, err);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Ignore already completed render tasks
        }
      }
    };
  }, [pdfDoc, pageNumber, scale, findings]);

  return (
    <div
      ref={(el) => registerPageRef(pageNumber, el)}
      className="relative mx-auto select-none"
      style={{
        width: `${pageDims.w}px`,
        height: `${pageDims.h}px`,
        backgroundColor: '#FFFDF9',
        border: '1px solid var(--rule-strong)',
      }}
      data-testid={`pdf-page-${pageNumber}`}
    >
      {/* Subtle architectural page index tag in top-left margin */}
      <div
        className="absolute -top-5 left-0 mono-num text-[10px] uppercase tracking-[0.08em]"
        style={{ color: 'var(--ink-slate)' }}
      >
        FOLIO P.{String(pageNumber).padStart(2, '0')}
        {findings.length > 0 ? ` · ${findings.length} TESTS MAPPED` : ''}
      </div>

      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        data-testid={`pdf-canvas-${pageNumber}`}
      />

      {/* Coordinate-mapped interactive forensic highlight layer */}
      {showHighlights && mappedRects.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {mappedRects.map((box) => {
            const isSelected = box.finding.id === selectedFindingId;
            const pal = verdictHighlightPalette(box.finding.verdict, isSelected);
            return (
              <button
                key={`${box.finding.id}-${box.rectIdx}`}
                ref={
                  box.rectIdx === 0
                    ? (el) => registerHighlightRef(box.finding.id, el)
                    : undefined
                }
                type="button"
                onClick={() => onSelectFinding(box.finding.id)}
                title={`${box.finding.rawMatch} — ${box.finding.verdict}`}
                aria-label={`Highlight ${box.finding.rawMatch}, verdict ${box.finding.verdict}`}
                data-testid={`pdf-highlight-${box.finding.id}`}
                className="absolute pointer-events-auto cursor-pointer transition-opacity"
                style={{
                  left: `${box.left}px`,
                  top: `${box.top}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                  backgroundColor: pal.bg,
                  border: `${pal.borderWidth}px solid ${pal.border}`,
                  borderRadius: '1px',
                  boxShadow: isSelected ? '0 0 0 2px rgba(29, 78, 216, 0.22)' : undefined,
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PdfViewport({
  pdfDoc,
  pageCount,
  findings,
  selectedFindingId,
  onSelectFinding,
  onUploadPdf,
  tablePages,
  loading,
}: PdfViewportProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scale, setScale] = useState<number>(1.08);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showHighlights, setShowHighlights] = useState<boolean>(true);

  const registerPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el);
    else pageRefs.current.delete(pageNum);
  }, []);

  const registerHighlightRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) highlightRefs.current.set(id, el);
    else highlightRefs.current.delete(id);
  }, []);

  // Auto-fit PDF width cleanly on first mount
  const fitWidth = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const availW = Math.max(360, container.clientWidth - 56);
    const ideal = Math.max(0.7, Math.min(1.5, availW / 612));
    setScale(Number(ideal.toFixed(2)));
  }, []);

  useEffect(() => {
    fitWidth();
  }, [fitWidth, pdfDoc]);

  // Smoothly scroll to the exact coordinate-mapped highlight when a finding is selected
  useEffect(() => {
    if (!selectedFindingId) return;
    const finding = findings.find((f) => f.id === selectedFindingId);
    if (!finding) return;
    setCurrentPage(finding.page);

    const hlEl = highlightRefs.current.get(selectedFindingId);
    if (hlEl) {
      hlEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return;
    }
    const pageEl = pageRefs.current.get(finding.page);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedFindingId, findings]);

  const jumpToPage = useCallback((pageNum: number) => {
    const clamped = Math.max(1, Math.min(pageCount, pageNum));
    setCurrentPage(clamped);
    const el = pageRefs.current.get(clamped);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pageCount]);

  // Track visible page on manual scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top + 80;
    let closestPage = 1;
    let bestDist = Infinity;

    for (let p = 1; p <= pageCount; p++) {
      const el = pageRefs.current.get(p);
      if (!el) continue;
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
      if (dist < bestDist) {
        bestDist = dist;
        closestPage = p;
      }
    }
    setCurrentPage(closestPage);
  }, [pageCount]);

  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <section
      aria-label="Manuscript PDF stage"
      className="lg:w-[58%] flex flex-col min-h-0 overflow-hidden"
      style={{
        borderRight: '1px solid var(--rule-hairline)',
        backgroundColor: 'var(--bg-inset)',
      }}
    >
      {/* Compact Archival PDF Instrument Toolbar */}
      <div
        className="h-[40px] shrink-0 px-3 flex items-center justify-between gap-2 select-none"
        style={{
          backgroundColor: 'var(--bg-folio)',
          borderBottom: '1px solid var(--rule-hairline)',
        }}
      >
        {/* Page Navigation + Quick Page Index */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => jumpToPage(currentPage - 1)}
            aria-label="Previous page"
            className="w-6 h-6 inline-flex items-center justify-center cursor-pointer disabled:opacity-35 hover:bg-[#ECE8DE]"
            style={{ border: '1px solid var(--rule-strong)', borderRadius: '2px' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="mono-num text-[11px] px-1 whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>
            P.{currentPage} / {pageCount || 1}
          </span>

          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => jumpToPage(currentPage + 1)}
            aria-label="Next page"
            className="w-6 h-6 inline-flex items-center justify-center cursor-pointer disabled:opacity-35 hover:bg-[#ECE8DE]"
            style={{ border: '1px solid var(--rule-strong)', borderRadius: '2px' }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {pageCount > 1 && pageCount <= 8 && (
            <div className="hidden sm:flex items-center gap-1 ml-1">
              {pageNumbers.map((pNum) => {
                const fCount = findings.filter((f) => f.page === pNum).length;
                const hasTable = tablePages.includes(pNum);
                const isActive = currentPage === pNum;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => jumpToPage(pNum)}
                    className="h-[22px] px-1.5 mono-num text-[10px] cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: isActive ? 'var(--ink-primary)' : 'var(--bg-ground)',
                      color: isActive ? 'var(--bg-folio)' : 'var(--ink-slate)',
                      border: `1px solid ${isActive ? 'var(--ink-primary)' : 'var(--rule-hairline)'}`,
                      borderRadius: '1px',
                    }}
                  >
                    P{pNum}
                    {fCount > 0 ? ` (${fCount})` : hasTable ? ' · TBL' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Zoom + Highlight Toggle + Upload PDF */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="inline-flex items-center h-[26px]"
            style={{
              backgroundColor: 'var(--bg-ground)',
              border: '1px solid var(--rule-strong)',
              borderRadius: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.65, Number((s - 0.12).toFixed(2))))}
              aria-label="Zoom out"
              className="w-6 h-full inline-flex items-center justify-center cursor-pointer hover:bg-[#ECE8DE]"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="mono-num text-[10.5px] px-1.5 min-w-[44px] text-center" style={{ color: 'var(--ink-primary)' }}>
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.0, Number((s + 0.12).toFixed(2))))}
              aria-label="Zoom in"
              className="w-6 h-full inline-flex items-center justify-center cursor-pointer hover:bg-[#ECE8DE]"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={fitWidth}
            title="Fit PDF width"
            aria-label="Fit PDF width"
            className="h-[26px] px-1.5 inline-flex items-center justify-center cursor-pointer hover:bg-[#ECE8DE]"
            style={{
              backgroundColor: 'var(--bg-folio)',
              border: '1px solid var(--rule-strong)',
              borderRadius: '2px',
              color: 'var(--ink-slate)',
            }}
          >
            <Maximize2 className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => setShowHighlights((h) => !h)}
            aria-pressed={showHighlights}
            className="h-[26px] px-2 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.07em] cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: showHighlights ? 'var(--tint-cobalt)' : 'var(--bg-folio)',
              color: showHighlights ? 'var(--ink-cobalt)' : 'var(--ink-slate)',
              border: `1px solid ${showHighlights ? 'var(--ink-cobalt)' : 'var(--rule-strong)'}`,
              borderRadius: '2px',
            }}
          >
            {showHighlights ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span className="hidden xl:inline">Overlays</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadPdf(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-[26px] px-2 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.07em] cursor-pointer whitespace-nowrap hover:bg-[#ECE8DE]"
            style={{
              backgroundColor: 'var(--bg-folio)',
              color: 'var(--ink-primary)',
              border: '1px solid var(--rule-strong)',
              borderRadius: '2px',
            }}
          >
            <Upload className="w-3 h-3" />
            <span>Upload PDF</span>
          </button>
        </div>
      </div>

      {/* Multi-Page HiDPI Canvas Stage */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-5 py-8 space-y-10"
      >
        {loading || !pdfDoc ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-2">
            <div className="micro-label" style={{ color: 'var(--ink-slate)' }}>
              RENDERING HIDPI MANUSCRIPT SPECIMEN
            </div>
            <div className="mono-num text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Binding version-matched PDF.js worker &amp; mapping text coordinates…
            </div>
          </div>
        ) : (
          pageNumbers.map((pageNum) => (
            <PdfPageCanvas
              key={`${pageNum}`}
              pdfDoc={pdfDoc}
              pageNumber={pageNum}
              scale={scale}
              findings={findings.filter((f) => f.page === pageNum)}
              selectedFindingId={selectedFindingId}
              showHighlights={showHighlights}
              onSelectFinding={onSelectFinding}
              registerPageRef={registerPageRef}
              registerHighlightRef={registerHighlightRef}
            />
          ))
        )}
      </div>
    </section>
  );
}
