import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCaseFile01Pdf } from '../../data/specimenPdf';
import { detectSampleSizeDrift, parseStatFindings } from '../statParser';
import { extractTableRowsFromPageText } from '../pdfExtractor';
import { auditTableRow } from '../grim';

test('Case File 01 binary PDF 1.4 has exact byte-offset xref table and valid header/trailer', () => {
  const bytes = generateCaseFile01Pdf();
  const ascii = new TextDecoder('latin1').decode(bytes);

  assert.ok(ascii.startsWith('%PDF-1.4\n'), 'PDF must begin with %PDF-1.4 header');
  assert.ok(ascii.endsWith('%%EOF\n'), 'PDF must terminate with %%EOF');

  // Parse startxref offset and confirm it points verbatim to "xref\n"
  const startXrefMatch = /startxref\n(\d+)\n%%EOF/.exec(ascii);
  assert.ok(startXrefMatch, 'Must contain startxref offset');
  const xrefOffset = Number.parseInt(startXrefMatch[1], 10);
  assert.equal(ascii.slice(xrefOffset, xrefOffset + 5), 'xref\n', 'startxref must land on xref');

  // Parse every xref entry and confirm exact byte offset lands on "<objId> 0 obj"
  const xrefSection = ascii.slice(xrefOffset);
  const entryRegex = /^(\d{10}) (\d{5}) ([nf]) $/gm;
  const entries: Array<{ offset: number; gen: number; status: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(xrefSection)) !== null) {
    entries.push({
      offset: Number.parseInt(m[1], 10),
      gen: Number.parseInt(m[2], 10),
      status: m[3],
    });
  }

  assert.equal(entries.length, 15, 'Should have 1 free entry + 14 indirect objects');
  assert.equal(entries[0].status, 'f');

  for (let objId = 1; objId < entries.length; objId++) {
    const off = entries[objId].offset;
    const expectedPrefix = `${objId} 0 obj\n`;
    assert.equal(
      ascii.slice(off, off + expectedPrefix.length),
      expectedPrefix,
      `Object ${objId} xref byte offset ${off} mismatch`
    );
  }
});

test('Case File 01 embedded statistical prose yields exact expected verdicts and silent N-drop', () => {
  // Decode the WinAnsi content streams from the generated PDF to verify the exact embedded tests
  const bytes = generateCaseFile01Pdf();
  const raw = new TextDecoder('latin1').decode(bytes);

  // Extract literal PDF text strings (...) and decode WinAnsi \262 -> ²
  const pieces: string[] = [];
  const tjRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRegex.exec(raw)) !== null) {
    const decoded = m[1]
      .replace(/\\262/g, '²')
      .replace(/\\226/g, '–')
      .replace(/\\227/g, '—')
      .replace(/\\267/g, '·')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    pieces.push(decoded);
  }

  const fullText = pieces.join('\n');
  const findings = parseStatFindings(fullText, 2);

  assert.equal(findings.length, 8, `Expected 8 findings in Case File 01, found ${findings.length}`);
  assert.deepEqual(
    findings.map((f) => f.verdict),
    [
      'VERIFIED',        // t(62) = 2.68, p = .009
      'DECISION ERROR',  // t(62) = 1.88, p = .041
      'ROUNDING DRIFT',  // F(2, 61) = 4.12, p = .012
      'VERIFIED',        // t(30) = 2.04, p = .050 (rounding-window grace)
      'VERIFIED',        // t(51) = 2.41, p = .0196 (silent N-drop!)
      'VERIFIED',        // r(62) = 0.34, p = .006
      'DECISION ERROR',  // X²(1) = 3.12, p = .048
      'VERIFIED',        // z = 2.58, p = .010
    ]
  );

  // Confirm sample-size drift detects the silent drop across df = 62, 51, 30
  const drift = detectSampleSizeDrift(findings);
  assert.equal(drift.hasDrift, true);
  assert.equal(drift.maxN, 64);
  assert.ok(drift.distinctNs.includes(53), 'Must detect implied N = 53 from t(51)');
});

test('extractTableRowsFromPageText extracts Page 3 Table 1 rows cleanly for Lab 02 handoff', () => {
  const simulatedPage3 = [
    'Table 1. Subgroup Descriptive Statistics',
    'Measure / Subgroup Condition Mean SD N Items',
    'Baseline Attention Span 4.25 1.13 16 1',
    'Interrupted Recall Score 5.19 1.42 12 1',
    'Delayed Retention 48h 3.20 1.36 10 1',
    'Cognitive Load Subscale 4.17 0.94 12 3',
    'Sustained Vigilance Index 5.40 1.17 15 1',
  ].join('\n');

  const rows = extractTableRowsFromPageText(simulatedPage3, 3);
  assert.equal(rows.length, 5);
  const statuses = rows.map((r) => auditTableRow(r, 'sample').status);
  assert.deepEqual(statuses, [
    'VERIFIED',
    'GRIM IMPOSSIBLE',
    'GRIMMER IMPOSSIBLE',
    'VERIFIED',
    'GRIMMER IMPOSSIBLE',
  ]);
});
