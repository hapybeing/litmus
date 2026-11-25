/**
 * Deterministic, zero-dependency, strictly spec-valid PDF 1.4 binary generator
 * for Case File 01: a 3-page academic pre-print manuscript with real typography,
 * 8 embedded statistical tests (2 decision errors, 1 rounding drift, 1 silent N-drop,
 * 5 verified), and a Page 3 descriptive summary table (Table 1) for Lab 02 handoff.
 *
 * All stream /Length values and xref byte offsets are computed strictly in UTF-8/ASCII
 * Uint8Array bytes via TextEncoder — never JS UTF-16 string .length.
 */

export const CASE_FILE_01_FILENAME =
  'CaseFile01_Attention_Restoration_Preprint.pdf';

export const CASE_FILE_01_TITLE =
  'Attention Restoration and Working Memory Efficiency Under Algorithmic Interruption';

type FontKey = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 62;
const MARGIN_R = 62;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

/**
 * Escapes text for PDF literal string (...) using WinAnsiEncoding octal codes
 * for typographic punctuation so pdfjs-dist renders and extracts clean Unicode.
 */
function encodePdfString(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '(') out += '\\(';
    else if (ch === ')') out += '\\)';
    else if (ch === '–') out += '\\226'; // en-dash (WinAnsi 0x96)
    else if (ch === '—') out += '\\227'; // em-dash (WinAnsi 0x97)
    else if (ch === '±') out += '\\261'; // plus-minus (WinAnsi 0xB1)
    else if (ch === '²') out += '\\262'; // superscript 2 (WinAnsi 0xB2)
    else if (ch === '·') out += '\\267'; // middle dot (WinAnsi 0xB7)
    else if (ch === '×') out += '\\327'; // multiplication (WinAnsi 0xD7)
    else if (ch === '−') out += '-'; // ASCII minus for reliable stat extraction
    else if (ch === '‘' || ch === '’') out += "'";
    else if (ch === '“' || ch === '”') out += '"';
    else if (code >= 32 && code <= 126) out += ch;
    else out += ' ';
  }
  return out;
}

/**
 * Conservative character width estimate (in em units) for Standard-14 fonts
 * to produce balanced editorial line wrapping within CONTENT_W.
 */
function estimateTextWidth(text: string, font: FontKey, fontSize: number): number {
  const isMono = font === 'F6';
  const isBold = font === 'F2' || font === 'F5';
  const isSans = font === 'F4' || font === 'F5';

  if (isMono) return text.length * fontSize * 0.6;

  let width = 0;
  const boldMult = isBold ? 1.055 : 1.0;
  const sansMult = isSans ? 1.04 : 1.0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === ' ') width += 0.27;
    else if ('ijlI.,;:\'!|()[]'.includes(c)) width += 0.29;
    else if ('rtfkJ-'.includes(c)) width += 0.37;
    else if ('mwMW'.includes(c)) width += 0.78;
    else if (c >= 'A' && c <= 'Z') width += 0.67;
    else if (c >= '0' && c <= '9') width += 0.52;
    else width += 0.48;
  }
  return width * fontSize * boldMult * sansMult;
}

function wrapParagraph(text: string, font: FontKey, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimateTextWidth(candidate, font, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

class PageCanvasBuilder {
  private ops: string[] = [];
  private cursorY = PAGE_H - 58;

  constructor(pageNum: number, totalPages: number) {
    // Crisp archival paper tint backdrop (subtle warm white inside PDF)
    this.ops.push('0.992 0.988 0.976 rg');
    this.ops.push(`0 0 ${PAGE_W} ${PAGE_H} re f`);
    this.ops.push('0.08 0.08 0.07 rg');
    this.ops.push('0.08 0.08 0.07 RG');

    // Running Header
    this.drawText(
      'ARCHIVES OF EMPIRICAL COGNITION · PRE-PRINT AUDIT SPECIMEN · CASE FILE 01',
      MARGIN_L,
      PAGE_H - 40,
      'F4',
      7.5,
      [0.36, 0.35, 0.31]
    );
    this.drawTextRight(
      `MANUSCRIPT ID: AEC-2026-0418`,
      PAGE_W - MARGIN_R,
      PAGE_H - 40,
      'F6',
      7.5,
      [0.36, 0.35, 0.31]
    );
    this.drawRule(MARGIN_L, PAGE_H - 47, PAGE_W - MARGIN_R, 0.6, [0.78, 0.75, 0.69]);

    // Running Footer
    this.drawRule(MARGIN_L, 48, PAGE_W - MARGIN_R, 0.5, [0.78, 0.75, 0.69]);
    this.drawText(
      'Keller, Lindqvist & Rao (2026) — Pre-Publication Statistical Verification Copy',
      MARGIN_L,
      36,
      'F3',
      8,
      [0.36, 0.35, 0.31]
    );
    this.drawTextRight(
      `Page ${pageNum} of ${totalPages}`,
      PAGE_W - MARGIN_R,
      36,
      'F4',
      8,
      [0.36, 0.35, 0.31]
    );

    this.cursorY = PAGE_H - 72;
  }

  getY(): number {
    return this.cursorY;
  }

  advance(pts: number): void {
    this.cursorY -= pts;
  }

  drawRule(
    x1: number,
    y: number,
    x2: number,
    width = 0.6,
    rgb: [number, number, number] = [0.15, 0.15, 0.14]
  ): void {
    this.ops.push(
      `q ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${width.toFixed(2)} w ${x1.toFixed(1)} ${y.toFixed(1)} m ${x2.toFixed(1)} ${y.toFixed(1)} l S Q`
    );
  }

  drawText(
    text: string,
    x: number,
    y: number,
    font: FontKey,
    size: number,
    rgb: [number, number, number] = [0.08, 0.08, 0.07]
  ): void {
    this.ops.push(
      `BT /${font} ${size.toFixed(1)} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${encodePdfString(text)}) Tj ET`
    );
  }

  drawTextRight(
    text: string,
    rightX: number,
    y: number,
    font: FontKey,
    size: number,
    rgb: [number, number, number] = [0.08, 0.08, 0.07]
  ): void {
    const w = estimateTextWidth(text, font, size);
    this.drawText(text, rightX - w, y, font, size, rgb);
  }

  addHeading(numLabel: string, title: string): void {
    this.cursorY -= 8;
    this.drawText(`${numLabel}  ${title}`, MARGIN_L, this.cursorY, 'F5', 11, [0.08, 0.08, 0.07]);
    this.cursorY -= 6;
    this.drawRule(MARGIN_L, this.cursorY, PAGE_W - MARGIN_R, 0.5, [0.82, 0.79, 0.74]);
    this.cursorY -= 15;
  }

  addParagraph(
    text: string,
    options?: {
      font?: FontKey;
      size?: number;
      leading?: number;
      indent?: number;
      afterGap?: number;
      rgb?: [number, number, number];
    }
  ): void {
    const font = options?.font ?? 'F1';
    const size = options?.size ?? 10.5;
    const leading = options?.leading ?? 14.8;
    const indent = options?.indent ?? 0;
    const afterGap = options?.afterGap ?? 9;
    const rgb = options?.rgb ?? [0.1, 0.1, 0.09];

    const lines = wrapParagraph(text, font, size, CONTENT_W - indent);
    for (const line of lines) {
      this.drawText(line, MARGIN_L + indent, this.cursorY, font, size, rgb);
      this.cursorY -= leading;
    }
    this.cursorY -= afterGap;
  }

  /**
   * Emits a clean highlighted inline prose block where statistical clauses remain
   * intact on crisp baselines for pixel-exact pdfjs-dist coordinate mapping.
   */
  addBulletLine(label: string, body: string): void {
    this.drawText(label, MARGIN_L + 10, this.cursorY, 'F2', 10, [0.08, 0.08, 0.07]);
    this.cursorY -= 13.5;
    this.addParagraph(body, { font: 'F1', size: 10.2, leading: 14.2, indent: 18, afterGap: 7 });
  }

  toStreamString(): string {
    return this.ops.join('\n') + '\n';
  }
}

function buildPage1Stream(): string {
  const p = new PageCanvasBuilder(1, 3);

  // Title Block
  p.addParagraph(
    'Attention Restoration and Working Memory Efficiency Under Algorithmic Interruption',
    { font: 'F2', size: 17.5, leading: 22, afterGap: 6, rgb: [0.07, 0.07, 0.06] }
  );
  p.addParagraph(
    'A Randomized Pre-Registered Behavioral Study and Replication Benchmark',
    { font: 'F3', size: 11.5, leading: 15, afterGap: 10, rgb: [0.32, 0.31, 0.28] }
  );
  p.addParagraph(
    'M. Keller (1), S. Lindqvist (2), and D. K. Rao (1)  ·  (1) Center for Quantitative Cognition, Zurich  ·  (2) Nordic Behavioral Lab, Uppsala',
    { font: 'F4', size: 8.8, leading: 12.5, afterGap: 12, rgb: [0.32, 0.31, 0.28] }
  );

  // Abstract Box
  const boxTop = p.getY() + 6;
  p.drawRule(MARGIN_L, boxTop, PAGE_W - MARGIN_R, 1.0, [0.12, 0.12, 0.11]);
  p.advance(10);
  p.drawText('ABSTRACT', MARGIN_L, p.getY(), 'F5', 8.5, [0.35, 0.34, 0.30]);
  p.advance(13);
  p.addParagraph(
    'Sustained algorithmic notification streams have been hypothesized to impair delayed verbal recall and executive working memory even after brief restorative breaks. In a double-blind randomized laboratory experiment (N = 64 healthy adults; n = 32 algorithmic interruption, n = 32 quiet control), we evaluated immediate recall, 48-hour delayed retention, dual-task cognitive load, and sustained vigilance across standardized integer-scored assessments. Primary contrasts indicated higher working memory retention in the quiet control condition alongside moderate positive associations with baseline span. This pre-print specimen contains complete inferential statistics and Table 1 summary indices for independent pre-flight forensic verification.',
    { font: 'F1', size: 9.8, leading: 13.8, afterGap: 6, rgb: [0.14, 0.14, 0.13] }
  );
  p.drawRule(MARGIN_L, p.getY() + 2, PAGE_W - MARGIN_R, 0.6, [0.78, 0.75, 0.69]);
  p.advance(14);

  // Section 1
  p.addHeading('1.', 'INTRODUCTION');
  p.addParagraph(
    'Contemporary knowledge work unfolds inside dense digital notification ecosystems characterized by irregular, algorithmically timed interruptions. Cognitive load theory predicts that frequent task-switching induces attentional residue that persists well beyond the physical termination of the interrupting stimulus, reducing consolidation into long-term episodic memory.'
  );
  p.addParagraph(
    'Prior experimental studies have reported mixed effect magnitudes across small laboratory cohorts, with ongoing methodological debate regarding selective outcome reporting, undisclosed participant exclusions, and unverified descriptive summary tables. The present study was designed as a tightly controlled behavioral trial to measure immediate recall, 48-hour delayed retention, and subjective cognitive load using uniform integer-scored instruments.'
  );

  // Section 2
  p.addHeading('2.', 'METHODS & SAMPLE SPECIFICATION');
  p.addParagraph(
    'Participants and Randomization. A total of N = 64 adult volunteers (34 female, 30 male; mean age 26.4 years, SD = 4.1) completed intake screening and were randomly assigned in balanced blocks to either the Quiet Control arm (n = 32) or the Algorithmic Interruption arm (n = 32). All participants provided written informed consent and completed the protocol in sound-attenuated testing booths.'
  );
  p.addParagraph(
    'Measures and Scoring Protocol. Primary recall endpoints were scored on a 7-point integer rubric (range 1 to 7). Subjective anxiety and dual-task strain were indexed by a validated 3-item integer Likert subscale (k = 3 items per respondent, averaged to two decimal places). All inferential hypotheses were evaluated at the canonical two-tailed alpha = .05 threshold unless otherwise noted in the analytical log.'
  );

  return p.toStreamString();
}

function buildPage2Stream(): string {
  const p = new PageCanvasBuilder(2, 3);

  p.addHeading('3.', 'PRIMARY EMPIRICAL RESULTS');
  p.addParagraph(
    'Below we report the primary confirmatory and secondary exploratory contrasts across the N = 64 cohort. All test statistics and associated p-values are reported directly from the author analysis log for full pre-flight auditability.'
  );

  // Finding 1 (VERIFIED) & Finding 2 (DECISION ERROR: t(62) = 1.88, p = .041 -> true p = .0648)
  p.addBulletLine(
    '3.1 Immediate Working Memory Recall & Secondary Fluency',
    'Participants in the quiet control condition achieved significantly higher immediate recall scores than those exposed to algorithmic interruptions, t(62) = 2.68, p = .009, reflecting a robust medium-to-large behavioral benefit. On the secondary verbal fluency probe, the authors also claimed a statistically significant advantage for the control group, t(62) = 1.88, p = .041, concluding that fluency gains survived the alpha = .05 threshold.'
  );

  // Finding 3 (ROUNDING DRIFT: F(2, 61) = 4.12, p = .012 -> true p = .0210)
  p.addBulletLine(
    '3.2 Three-Block Omnibus Latency Analysis',
    'A one-way omnibus ANOVA across the three interruption cadence blocks revealed a reliable main effect of notification density on response latency, F(2, 61) = 4.12, p = .012, with slowest switching recovery observed during burst-scheduled alerts.'
  );

  // Finding 4 (VERIFIED via Rounding-Window Grace: t(30) = 2.04, p = .050)
  p.addBulletLine(
    '3.3 Pilot Calibration Subgroup Contrast',
    'Within the initial calibration subsample (n = 32), the contrast between high- and low-salience prompt tones sat directly on the nominal significance boundary, t(30) = 2.04, p = .050, consistent with the expected rounding interval of the underlying unrounded t-statistic.'
  );

  // Finding 5 (VERIFIED + SILENT N-DROP: t(51) = 2.41, p = .0196 -> df dropped from 62 to 51!)
  p.addBulletLine(
    '3.4 Delayed 48-Hour Retention Contrast',
    'At the 48-hour follow-up session, the delayed retention comparison remained statistically significant, t(51) = 2.41, p = .0196, favoring uninterrupted consolidation. No attrition table or exclusion criterion was reported in the text for the reduced degrees of freedom.'
  );

  // Finding 6 (VERIFIED: r(62) = 0.34, p = .006)
  p.addBulletLine(
    '3.5 Baseline Span Covariation',
    'Across the full experimental cohort, baseline working memory span correlated positively with post-intervention transfer accuracy, r(62) = 0.34, p = .006, replicating prior individual-differences benchmarks.'
  );

  // Finding 7 (DECISION ERROR: X²(1) = 3.12, p = .048 -> true p = .0773) & Finding 8 (VERIFIED: z = 2.58, p = .010)
  p.addBulletLine(
    '3.6 Categorical Completion & Non-Parametric Vigilance Checks',
    'A chi-square test of independence on error-free task completion across arms was reported as statistically significant, X²(1) = 3.12, p = .048, suggesting higher perfect-trial rates without alerts. Finally, a rank-based Wilcoxon normal approximation on sustained vigilance confirmed a significant shift in median reaction stability, z = 2.58, p = .010.'
  );

  return p.toStreamString();
}

function buildPage3Stream(): string {
  const p = new PageCanvasBuilder(3, 3);

  p.addHeading('4.', 'DESCRIPTIVE SUMMARY TABLE (SUBGROUP ENDPOINTS)');
  p.addParagraph(
    'Table 1 summarizes subgroup descriptive statistics (Means, Standard Deviations, subgroup sample sizes N, and scale item counts k) reported for the secondary laboratory modules. These integer-scored summary metrics are formatted for direct GRIM and GRIMMER granularity auditing.'
  );

  p.advance(4);
  p.drawText(
    'Table 1. Subgroup Descriptive Statistics for Integer-Scored Recall and Load Measures',
    MARGIN_L,
    p.getY(),
    'F2',
    9.8,
    [0.08, 0.08, 0.07]
  );
  p.advance(10);

  // Booktabs-style top rule
  const tblLeft = MARGIN_L;
  const tblRight = PAGE_W - MARGIN_R;
  p.drawRule(tblLeft, p.getY(), tblRight, 1.1, [0.08, 0.08, 0.07]);
  p.advance(14);

  // Column x-anchors
  const colLabel = tblLeft + 4;
  const colMean = tblLeft + 270;
  const colSd = tblLeft + 336;
  const colN = tblLeft + 402;
  const colK = tblLeft + 458;

  p.drawText('Measure / Subgroup Condition', colLabel, p.getY(), 'F5', 8.8, [0.25, 0.24, 0.21]);
  p.drawTextRight('Mean', colMean, p.getY(), 'F5', 8.8, [0.25, 0.24, 0.21]);
  p.drawTextRight('SD', colSd, p.getY(), 'F5', 8.8, [0.25, 0.24, 0.21]);
  p.drawTextRight('N', colN, p.getY(), 'F5', 8.8, [0.25, 0.24, 0.21]);
  p.drawTextRight('Items', colK, p.getY(), 'F5', 8.8, [0.25, 0.24, 0.21]);
  p.advance(7);
  p.drawRule(tblLeft, p.getY(), tblRight, 0.6, [0.35, 0.34, 0.30]);
  p.advance(15);

  const tableRows: Array<[string, string, string, string, string]> = [
    ['Baseline Attention Span', '4.25', '1.13', '16', '1'],
    ['Interrupted Recall Score', '5.19', '1.42', '12', '1'],
    ['Delayed Retention 48h', '3.20', '1.36', '10', '1'],
    ['Cognitive Load Subscale', '4.17', '0.94', '12', '3'],
    ['Sustained Vigilance Index', '5.40', '1.17', '15', '1'],
  ];

  for (const [label, mean, sd, n, k] of tableRows) {
    p.drawText(label, colLabel, p.getY(), 'F1', 9.8, [0.08, 0.08, 0.07]);
    p.drawTextRight(mean, colMean, p.getY(), 'F6', 9.5, [0.08, 0.08, 0.07]);
    p.drawTextRight(sd, colSd, p.getY(), 'F6', 9.5, [0.08, 0.08, 0.07]);
    p.drawTextRight(n, colN, p.getY(), 'F6', 9.5, [0.08, 0.08, 0.07]);
    p.drawTextRight(k, colK, p.getY(), 'F6', 9.5, [0.08, 0.08, 0.07]);
    p.advance(16.5);
  }

  // Booktabs bottom rule
  p.drawRule(tblLeft, p.getY() + 6, tblRight, 1.0, [0.08, 0.08, 0.07]);
  p.advance(8);
  p.addParagraph(
    'Note. All means and sample standard deviations (N - 1 denominator) are reported to two decimal places from integer-scored 1-to-7 items (k = 1 single item; k = 3 multi-item composite).',
    { font: 'F3', size: 8.8, leading: 12.2, afterGap: 18, rgb: [0.35, 0.34, 0.30] }
  );

  // Section 5
  p.addHeading('5.', 'DISCUSSION & AUDIT LIMITATIONS');
  p.addParagraph(
    'The present behavioral findings underscore the sensitivity of episodic consolidation to irregular digital alerts, while also illustrating why automated pre-flight statistical verification is essential prior to peer review. Subtle copy-editing discrepancies in reported p-values, undocumented degrees-of-freedom attrition across follow-up waves, and integer-granularity anomalies in subgroup tables can materially alter editorial conclusions if left unexamined.'
  );
  p.addParagraph(
    'Open Verification Statement. All summary values and inferential clauses in this pre-print specimen are structured for fully client-side verification using exact double-precision tail integrals, rounding-window intervals, and Allard parity-checked GRIMMER lattices.'
  );

  // Compact References
  p.addHeading('6.', 'REFERENCES');
  p.addParagraph(
    'Allard, A. (2018). Analytic-GRIMMER: A new way of testing the possibility of standard deviations. Meta-Psychology, 2.',
    { font: 'F1', size: 9.2, leading: 12.8, afterGap: 5 }
  );
  p.addParagraph(
    'Brown, N. J. L., & Heathers, J. A. J. (2017). The GRIM test: A simple technique detects numerous anomalies in the reporting of results in psychology. Social Psychological and Personality Science, 8(4), 363-369.',
    { font: 'F1', size: 9.2, leading: 12.8, afterGap: 5 }
  );
  p.addParagraph(
    'Nuijten, M. B., Hartgerink, C. H. J., van Assen, M. A. L. M., Epskamp, S., & Wicherts, J. M. (2016). The prevalence of statistical reporting errors in psychology (1985-2013). Behavior Research Methods, 48(4), 1205-1226.',
    { font: 'F1', size: 9.2, leading: 12.8, afterGap: 4 }
  );

  return p.toStreamString();
}

/**
 * Assembles a binary PDF 1.4 Uint8Array with exact byte-counted stream lengths
 * and strictly 20-byte-per-entry xref table.
 */
export function generateCaseFile01Pdf(): Uint8Array {
  const encoder = new TextEncoder();

  const pageStreams = [buildPage1Stream(), buildPage2Stream(), buildPage3Stream()];
  const pageStreamBytes = pageStreams.map((s) => encoder.encode(s));

  // Object allocation:
  // 1: Catalog
  // 2: Pages
  // 3..8: Standard-14 Type1 Fonts (F1..F6) with WinAnsiEncoding
  // 9, 10: Page 1 + Content 1
  // 11, 12: Page 2 + Content 2
  // 13, 14: Page 3 + Content 3
  const fontResourceDict =
    '<< /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R /F6 8 0 R >>';

  const objects: Uint8Array[] = [];
  const pushTextObj = (id: number, body: string) => {
    objects.push(encoder.encode(`${id} 0 obj\n${body}\nendobj\n`));
  };
  const pushStreamObj = (id: number, streamBytes: Uint8Array) => {
    const head = encoder.encode(
      `${id} 0 obj\n<< /Length ${streamBytes.byteLength} >>\nstream\n`
    );
    const tail = encoder.encode(`endstream\nendobj\n`);
    const combined = new Uint8Array(head.byteLength + streamBytes.byteLength + tail.byteLength);
    combined.set(head, 0);
    combined.set(streamBytes, head.byteLength);
    combined.set(tail, head.byteLength + streamBytes.byteLength);
    objects.push(combined);
  };

  pushTextObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  pushTextObj(2, '<< /Type /Pages /Kids [9 0 R 11 0 R 13 0 R] /Count 3 >>');

  pushTextObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  pushTextObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  pushTextObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>');
  pushTextObj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  pushTextObj(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pushTextObj(8, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  // Pages 1..3
  const pageObjIds = [
    [9, 10],
    [11, 12],
    [13, 14],
  ] as const;

  for (let i = 0; i < 3; i++) {
    const [pageId, contentId] = pageObjIds[i];
    pushTextObj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font ${fontResourceDict} >> /Contents ${contentId} 0 R >>`
    );
    pushStreamObj(contentId, pageStreamBytes[i]);
  }

  // Binary PDF 1.4 header (including high-bit comment bytes per PDF 1.4 spec)
  const headerBytes = new Uint8Array([
    ...encoder.encode('%PDF-1.4\n%'),
    0xe2,
    0xe3,
    0xcf,
    0xd3,
    0x0a,
  ]);

  const offsets: number[] = [];
  let cursor = headerBytes.byteLength;
  for (const objBytes of objects) {
    offsets.push(cursor);
    cursor += objBytes.byteLength;
  }

  const xrefOffset = cursor;
  const totalObjects = objects.length + 1; // +1 for free object 0
  const xrefLines = [`xref\n0 ${totalObjects}\n`, '0000000000 65535 f \n'];
  for (const off of offsets) {
    xrefLines.push(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  const trailer =
    xrefLines.join('') +
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const trailerBytes = encoder.encode(trailer);

  const totalLen = cursor + trailerBytes.byteLength;
  const pdf = new Uint8Array(totalLen);
  pdf.set(headerBytes, 0);
  let pos = headerBytes.byteLength;
  for (const objBytes of objects) {
    pdf.set(objBytes, pos);
    pos += objBytes.byteLength;
  }
  pdf.set(trailerBytes, pos);

  return pdf;
}
