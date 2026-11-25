import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  ManuscriptAuditResult,
  PdfBoundingBox,
  PdfFinding,
  PdfPageSummary,
  TableRowInput,
} from '../types/forensics';
import { computeSha256Fingerprint } from './cryptoHash';
import { detectSampleSizeDrift, parseStatFindings } from './statParser';

// Dynamically bind exact version-matched ESM worker from jsDelivr CDN
const CDN_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_WORKER_URL;

interface RawPdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

interface PositionedItem {
  str: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  baselineY: number;
  fontHeight: number;
}

interface CharProvenance {
  itemIdx: number;
  /** Character index inside PositionedItem.str (0-based), or -1 for synthetic whitespace */
  charInItem: number;
}

/**
 * Normalizes PDF ligatures and special whitespace while preserving exact 1-to-N provenance
 * back to the originating TextItem.
 */
function normalizePdfTextPiece(raw: string): string {
  return raw
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\u00A0/g, ' ')
    .replace(/\u00AD/g, '');
}

/**
 * Converts pdfjs-dist TextContent items into a reading-order normalized page string
 * with parallel character-to-TextItem provenance for pixel-accurate bounding box mapping.
 */
function buildPageCharIndex(rawItems: RawPdfTextItem[]): {
  items: PositionedItem[];
  pageText: string;
  provenance: CharProvenance[];
} {
  const items: PositionedItem[] = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw.str !== 'string' || raw.str.length === 0) continue;
    const tx = raw.transform;
    if (!Array.isArray(tx) || tx.length < 6) continue;

    const fontHeight = Math.max(
      Math.hypot(tx[2], tx[3]),
      Math.hypot(tx[0], tx[1]),
      raw.height || 10
    );
    const x1 = tx[4];
    const baselineY = tx[5];
    const width = Math.max(raw.width || 0, raw.str.length * fontHeight * 0.28);
    const y1 = baselineY - fontHeight * 0.22;
    const y2 = baselineY + fontHeight * 0.88;

    items.push({
      str: raw.str,
      x1,
      y1,
      x2: x1 + width,
      y2,
      baselineY,
      fontHeight,
    });
  }

  // Sort into natural top-to-bottom visual lines, then left-to-right within each line
  items.sort((a, b) => {
    const tol = Math.max(a.fontHeight, b.fontHeight) * 0.42;
    if (Math.abs(a.baselineY - b.baselineY) > tol) {
      return b.baselineY - a.baselineY; // Higher PDF Y = higher on page
    }
    return a.x1 - b.x1;
  });

  const chars: string[] = [];
  const provenance: CharProvenance[] = [];

  for (let i = 0; i < items.length; i++) {
    const curr = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      const lineTol = Math.max(prev.fontHeight, curr.fontHeight) * 0.45;
      const sameLine = Math.abs(prev.baselineY - curr.baselineY) <= lineTol;
      const horizGap = curr.x1 - prev.x2;

      if (!sameLine) {
        chars.push('\n');
        provenance.push({ itemIdx: -1, charInItem: -1 });
      } else if (
        horizGap > Math.min(prev.fontHeight, curr.fontHeight) * 0.16 &&
        chars[chars.length - 1] !== ' ' &&
        !curr.str.startsWith(' ')
      ) {
        chars.push(' ');
        provenance.push({ itemIdx: -1, charInItem: -1 });
      }
    }

    const rawStr = curr.str;
    for (let c = 0; c < rawStr.length; c++) {
      const piece = normalizePdfTextPiece(rawStr[c]);
      for (let k = 0; k < piece.length; k++) {
        chars.push(piece[k]);
        provenance.push({ itemIdx: i, charInItem: c });
      }
    }
  }

  return {
    items,
    pageText: chars.join(''),
    provenance,
  };
}

/**
 * Maps a regex match span [startIndex, endIndex) back to crisp per-line PDF user-space
 * bounding boxes, proportionally interpolating start/end item horizontal bounds so highlights
 * tightly hug the exact statistical clause without bleeding across the entire line.
 */
function mapMatchSpanToBoxes(
  startIndex: number,
  endIndex: number,
  items: PositionedItem[],
  provenance: CharProvenance[]
): PdfBoundingBox[] {
  // Collect per-item min/max matched character offsets
  const itemSpans = new Map<number, { minChar: number; maxChar: number }>();

  for (let idx = startIndex; idx < endIndex && idx < provenance.length; idx++) {
    const prov = provenance[idx];
    if (prov.itemIdx < 0) continue;
    const existing = itemSpans.get(prov.itemIdx);
    if (!existing) {
      itemSpans.set(prov.itemIdx, { minChar: prov.charInItem, maxChar: prov.charInItem });
    } else {
      if (prov.charInItem < existing.minChar) existing.minChar = prov.charInItem;
      if (prov.charInItem > existing.maxChar) existing.maxChar = prov.charInItem;
    }
  }

  const subBoxes: Array<PdfBoundingBox & { baselineY: number; fontHeight: number }> = [];

  for (const [itemIdx, span] of itemSpans.entries()) {
    const item = items[itemIdx];
    const totalLen = Math.max(1, item.str.length);
    const totalW = item.x2 - item.x1;

    const fracStart = Math.max(0, Math.min(1, span.minChar / totalLen));
    const fracEnd = Math.max(fracStart + 1 / totalLen, Math.min(1, (span.maxChar + 1) / totalLen));

    subBoxes.push({
      x1: item.x1 + totalW * fracStart,
      x2: item.x1 + totalW * fracEnd,
      y1: item.y1,
      y2: item.y2,
      baselineY: item.baselineY,
      fontHeight: item.fontHeight,
    });
  }

  if (subBoxes.length === 0) return [];

  // Cluster sub-boxes by visual baseline so wrapped stats produce separate per-line rects
  subBoxes.sort((a, b) => b.baselineY - a.baselineY || a.x1 - b.x1);
  const lines: Array<PdfBoundingBox & { baselineY: number; fontHeight: number }> = [];

  for (const box of subBoxes) {
    const matchLine = lines.find(
      (ln) => Math.abs(ln.baselineY - box.baselineY) <= Math.max(ln.fontHeight, box.fontHeight) * 0.45
    );
    if (!matchLine) {
      lines.push({ ...box });
    } else {
      matchLine.x1 = Math.min(matchLine.x1, box.x1);
      matchLine.x2 = Math.max(matchLine.x2, box.x2);
      matchLine.y1 = Math.min(matchLine.y1, box.y1);
      matchLine.y2 = Math.max(matchLine.y2, box.y2);
    }
  }

  // Add subtle 1.5pt breathing pad around tight glyph bounds
  return lines.map((ln) => ({
    x1: ln.x1 - 1.5,
    y1: ln.y1 - 1.0,
    x2: ln.x2 + 1.5,
    y2: ln.y2 + 1.0,
  }));
}

/**
 * Extracts clean surrounding context around a matched test statistic.
 */
function extractContextSnippet(pageText: string, start: number, end: number): string {
  const flat = pageText.replace(/\s+/g, ' ');
  // Approximate flat offsets using character count before start
  const beforeFlat = pageText.slice(0, start).replace(/\s+/g, ' ');
  const matchFlat = pageText.slice(start, end).replace(/\s+/g, ' ');
  const fStart = beforeFlat.length;
  const fEnd = fStart + matchFlat.length;

  const lo = Math.max(0, fStart - 68);
  const hi = Math.min(flat.length, fEnd + 68);
  const prefix = lo > 0 ? '…' : '';
  const suffix = hi < flat.length ? '…' : '';
  return `${prefix}${flat.slice(lo, hi).trim()}${suffix}`;
}

/**
 * Automatically detects descriptive table rows (Label, Mean, SD, N [, Items])
 * from extracted PDF page lines for 1-click handoff into Lab 02 (GRIM / GRIMMER).
 */
export function extractTableRowsFromPageText(
  pageText: string,
  pageNumber: number
): TableRowInput[] {
  const lines = pageText.split(/\r?\n/);
  const rows: TableRowInput[] = [];

  // Match lines like: "Baseline Attention Span 4.25 1.13 16 1" or "Delayed Recall (48h)  3.20  1.36  10"
  // Also supports parenthesized SD: "Control Group 4.25 (1.13) 16"
  const rowRegex =
    /^([A-Za-z][A-Za-z0-9\s\-–—/().]{2,54}?)\s+([+\-−]?\d+\.\d+)\s+\(?(\d+\.\d+)\)?\s+(\d{1,4})(?:\s+(\d{1,2}))?\s*$/;

  let idx = 1;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 8) continue;
    // Skip prose lines with test statistics or years
    if (/[=<>]|p\s*=|Table\s+\d|Page\s+\d|\(\d{4}\)/i.test(line)) continue;

    const m = rowRegex.exec(line);
    if (!m) continue;

    const label = m[1].trim();
    const meanStr = m[2].replace(/[−–—]/g, '-');
    const sdStr = m[3];
    const nVal = Number.parseInt(m[4], 10);
    const itemsVal = m[5] ? Math.max(1, Number.parseInt(m[5], 10)) : 1;

    // Basic sanity bounds against accidentally parsing reference numbers or years
    if (!Number.isFinite(nVal) || nVal < 2 || nVal > 5000) continue;
    if (Number.parseFloat(sdStr) < 0) continue;
    if (itemsVal > 50) continue;

    rows.push({
      id: `pdf-p${pageNumber}-row-${idx}`,
      label,
      meanStr,
      sdStr,
      n: nVal,
      items: itemsVal,
      note: `Extracted from PDF Page ${pageNumber}`,
    });
    idx++;
  }

  return rows;
}

/**
 * Opens a PDF binary buffer via pdfjs-dist using the version-matched jsDelivr ESM worker.
 * If an isolated sandbox blocks external CDN requests, gracefully retries with Vite's local worker URL.
 */
export async function loadPdfDocument(pdfBytes: Uint8Array): Promise<PDFDocumentProxy> {
  // Always clone bytes because pdfjs-dist transfers the underlying ArrayBuffer to the worker
  const makeCopy = () => new Uint8Array(pdfBytes);

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_WORKER_URL;
    const loadingTask = pdfjsLib.getDocument({
      data: makeCopy(),
      useSystemFonts: true,
    });
    return await loadingTask.promise;
  } catch (err) {
    // Fallback only if CDN worker cannot be fetched (e.g. offline / air-gapped environment)
    const fallbackWorker = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    if (pdfjsLib.GlobalWorkerOptions.workerSrc !== fallbackWorker) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = fallbackWorker;
      const retryTask = pdfjsLib.getDocument({
        data: makeCopy(),
        useSystemFonts: true,
      });
      return await retryTask.promise;
    }
    throw err;
  }
}

/**
 * Full live PDF forensic audit pipeline:
 * 1. Computes real WebCrypto SHA-256 fingerprint on raw PDF bytes.
 * 2. Extracts reading-order text & exact character provenance across all pages.
 * 3. Runs statParser.ts + exact coordinate-mapped per-line bounding boxes.
 * 4. Runs sample-size (N / df) drift detection across the entire manuscript.
 * 5. Detects descriptive Mean/SD/N tables for 1-click Lab 02 GRIM/GRIMMER handoff.
 */
export async function auditPdfDocument(
  pdfDoc: PDFDocumentProxy,
  rawBytes: Uint8Array,
  fileName: string
): Promise<ManuscriptAuditResult> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { shortHash } = await computeSha256Fingerprint(rawBytes);

  const pageCount = pdfDoc.numPages;
  const pages: PdfPageSummary[] = [];
  const allFindings: PdfFinding[] = [];
  const extractedTableRows: TableRowInput[] = [];
  const tablePageSet = new Set<number>();

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const rawItems: RawPdfTextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        rawItems.push(item as RawPdfTextItem);
      }
    }

    const { items, pageText, provenance } = buildPageCharIndex(rawItems);
    const parsed = parseStatFindings(pageText, pageNum);

    const pageFindings: PdfFinding[] = parsed.map((finding) => ({
      ...finding,
      page: pageNum,
      rects: mapMatchSpanToBoxes(finding.startIndex, finding.endIndex, items, provenance),
      contextSnippet: extractContextSnippet(pageText, finding.startIndex, finding.endIndex),
    }));

    allFindings.push(...pageFindings);

    const detectedRows = extractTableRowsFromPageText(pageText, pageNum);
    if (detectedRows.length > 0) {
      extractedTableRows.push(...detectedRows);
      tablePageSet.add(pageNum);
    }

    pages.push({
      pageNumber: pageNum,
      widthPt: viewport.width,
      heightPt: viewport.height,
      text: pageText,
      findingCount: pageFindings.length,
    });
  }

  const driftReport = detectSampleSizeDrift(allFindings);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    fileName,
    fileSizeBytes: rawBytes.byteLength,
    sha256Short: shortHash,
    pageCount,
    pages,
    findings: allFindings,
    driftReport,
    extractedTableRows,
    extractedTablePages: Array.from(tablePageSet).sort((a, b) => a - b),
    extractionMs: Math.max(0.1, t1 - t0),
  };
}

/**
 * Formats a clean Markdown audit report for Lab 01 Manuscript Forensics.
 */
export function formatManuscriptAuditMarkdown(audit: ManuscriptAuditResult): string {
  const decisionErrors = audit.findings.filter((f) => f.verdict === 'DECISION ERROR').length;
  const roundingDrifts = audit.findings.filter((f) => f.verdict === 'ROUNDING DRIFT').length;
  const verified = audit.findings.filter((f) => f.verdict === 'VERIFIED').length;
  const timestamp = new Date().toISOString();

  const header = [
    `# LITMUS Forensic Manuscript Audit Dossier`,
    ``,
    `- **Manuscript:** ${audit.fileName}`,
    `- **Pages:** ${audit.pageCount} · **Size:** ${(audit.fileSizeBytes / 1024).toFixed(1)} KB`,
    `- **SHA-256 Fingerprint:** \`${audit.sha256Short}\``,
    `- **Timestamp (UTC):** ${timestamp}`,
    `- **Findings:** ${audit.findings.length} total · ${decisionErrors} DECISION ERROR · ${roundingDrifts} ROUNDING DRIFT · ${verified} VERIFIED`,
    `- **Sample-Size Drift:** ${audit.driftReport.message}`,
    ``,
    `| Page | Extracted Test | Reported p | Exact p (2-tailed) | Rounding Window | Verdict |`,
    `| ---: | --- | ---: | ---: | --- | --- |`,
  ];

  const rows = audit.findings.map((f) => {
    const exactP = f.pComputedTwoTailed < 0.0001 ? '< .0001' : f.pComputedTwoTailed.toFixed(4);
    const win = `[${f.pWindowTwoTailed[0].toFixed(4)}, ${f.pWindowTwoTailed[1].toFixed(4)}]`;
    return `| P.${f.page} | \`${f.rawMatch}\` | ${f.pComparator} ${f.pRaw} | ${exactP} | ${win} | **${f.verdict}** |`;
  });

  return [...header, ...rows, ``].join('\n');
}
