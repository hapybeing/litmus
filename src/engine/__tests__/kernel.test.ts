import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chiSquarePdf,
  chiSquarePValue,
  criticalValue,
  erfc,
  fPdf,
  fPValue,
  logGamma,
  normalZPdf,
  normalZPValue,
  pearsonRPValue,
  regularizedIncompleteBeta,
  regularizedIncompleteGammaQ,
  studentTPdf,
  studentTPValue,
} from '../distributions';
import {
  auditTableRow,
  discreteMinSumOfSquares,
  evaluateGrim,
  evaluateGrimmer,
  parseBatchTableText,
} from '../grim';
import { detectSampleSizeDrift, parseStatFindings } from '../statParser';
import { runKernelSelfTest } from '../selfTest';
import { TABLE_SPECIMENS } from '../../data/tableSpecimens';

test('Lanczos logGamma matches exact factorials and half-integers', () => {
  assert.ok(Math.abs(Math.exp(logGamma(5)) - 24) < 1e-12);
  assert.ok(Math.abs(Math.exp(logGamma(0.5)) - Math.sqrt(Math.PI)) < 1e-13);
  assert.ok(Math.abs(logGamma(10) - Math.log(362880)) < 1e-12);
});

test('erfc and incomplete gamma / beta achieve high double precision', () => {
  assert.ok(Math.abs(erfc(0) - 1) < 1e-15);
  assert.ok(Math.abs(erfc(1.959963984540054 / Math.SQRT2) - 0.05) < 1e-12);
  assert.ok(Math.abs(erfc(-1) - (2 - erfc(1))) < 1e-15);
  assert.ok(Math.abs(regularizedIncompleteBeta(0.5, 2, 2) - 0.5) < 1e-13);
  assert.ok(Math.abs(regularizedIncompleteGammaQ(1, 1) - Math.exp(-1)) < 1e-13);
});

test('Exact distribution p-values, PDFs, and binary-search critical values', () => {
  assert.ok(Math.abs(studentTPValue(2.042272456, 30, 2) - 0.05) < 1e-8);
  assert.ok(Math.abs(studentTPValue(1.983971519, 100, 2) - 0.05) < 1e-8);
  assert.ok(Math.abs(fPValue(3.354130829, 2, 27) - 0.05) < 1e-8);
  assert.ok(Math.abs(chiSquarePValue(3.841458821, 1) - 0.05) < 1e-8);
  assert.ok(Math.abs(normalZPValue(1.959963985, 2) - 0.05) < 1e-8);
  assert.ok(Math.abs(pearsonRPValue(0.361007, 28, 2) - 0.05) < 1e-5);

  // Critical value inverse consistency
  assert.ok(Math.abs(criticalValue('t', 30, null, 0.05, 2) - 2.042272456) < 1e-6);
  assert.ok(Math.abs(criticalValue('F', 2, 27, 0.05, 2) - 3.354130829) < 1e-6);
  assert.ok(Math.abs(criticalValue('chi2', 1, null, 0.05, 2) - 3.841458821) < 1e-6);
  assert.ok(Math.abs(criticalValue('z', null, null, 0.05, 2) - 1.959963985) < 1e-6);

  // PDF sanity checks
  assert.ok(Math.abs(normalZPdf(0) - 1 / Math.sqrt(2 * Math.PI)) < 1e-12);
  assert.ok(studentTPdf(0, 30) > 0.39 && studentTPdf(0, 30) < 0.40);
  assert.ok(fPdf(1, 2, 27) > 0);
  assert.ok(chiSquarePdf(2, 2) > 0);
});

test('StatParser handles APA tests, rounding-window grace, decision errors, and N-drift', () => {
  const sample = [
    'Primary contrast was significant, t(42) = 1.91, p = .041.',
    'Borderline check yielded t(30) = 2.04, p = .050.',
    'ANOVA interaction was F(2, 27) = 3.35, p = .050.',
    'Chi-square reported χ²(1, N = 80) = 3.84, p = .050.',
    'Correlation was r(28) = −.361, p = .050.',
    'Subgroup check gave t(32) = 2.15, p = .039.',
  ].join(' ');

  const findings = parseStatFindings(sample, 1);
  assert.equal(findings.length, 6);
  assert.equal(findings[0].verdict, 'DECISION ERROR');
  assert.equal(findings[1].verdict, 'VERIFIED');
  assert.equal(findings[2].verdict, 'VERIFIED');
  assert.equal(findings[3].verdict, 'VERIFIED');
  assert.equal(findings[4].verdict, 'VERIFIED');
  assert.equal(findings[5].verdict, 'VERIFIED');

  const drift = detectSampleSizeDrift(findings);
  assert.equal(drift.hasDrift, true);
  assert.equal(drift.minN, 30);
  assert.equal(drift.maxN, 80);
});

test('GRIM and Allard (2018) GRIMMER handle edge cases, negative sums, multi-item k, and parity', () => {
  // Classic GRIM failure and pass
  const gFail = evaluateGrim('5.19', 12, 1);
  assert.equal(gFail.applicable, true);
  assert.equal(gFail.consistent, false);

  const gPass = evaluateGrim('5.17', 12, 1);
  assert.equal(gPass.consistent, true);
  assert.equal(gPass.impliedSum, 62);

  // Negative mean GRIM and discrete Cauchy-Schwarz floor
  const gNeg = evaluateGrim('-1.50', 4, 1);
  assert.equal(gNeg.consistent, true);
  assert.equal(gNeg.impliedSum, -6);
  assert.equal(discreteMinSumOfSquares(-6, 4), 10); // [-2, -2, -1, -1] => 4+4+1+1 = 10

  // Pure Allard parity exclusion: M=3.20, SD=1.36, N=10 -> Q=119 is ODD while S=32 is EVEN
  const grimmerParity = evaluateGrimmer('3.20', '1.36', 10, 1, 'sample');
  assert.ok(grimmerParity);
  assert.equal(grimmerParity.consistent, false);
  assert.ok(grimmerParity.parityForbiddenInWindow.includes(119));

  // Granularity gap exclusion: M=3.20, SD=1.35, N=10
  const grimmerGap = evaluateGrimmer('3.20', '1.35', 10, 1, 'sample');
  assert.ok(grimmerGap);
  assert.equal(grimmerGap.consistent, false);
  assert.equal(grimmerGap.validParityCandidates.length, 0);

  // Valid parity neighbor: Q=118 (EVEN) -> SD=1.31656 -> 1.32
  const grimmerOk = evaluateGrimmer('3.20', '1.32', 10, 1, 'sample');
  assert.ok(grimmerOk);
  assert.equal(grimmerOk.consistent, true);
  assert.ok(grimmerOk.validParityCandidates.includes(118));
});

test('Startup kernel self-test passes 100% of assertions', () => {
  const report = runKernelSelfTest();
  assert.equal(report.allPassed, true, `Failed assertions: ${JSON.stringify(report.assertions.filter((a) => !a.passed))}`);
  assert.ok(report.totalCount >= 12);
});

test('Preloaded Table Specimen 1 and 2 rows match exact intended forensic verdicts', () => {
  const spec1 = TABLE_SPECIMENS[0];
  const audits1 = spec1.rows.map((r) => auditTableRow(r, spec1.sdMode));
  assert.deepEqual(
    audits1.map((a) => a.status),
    [
      'VERIFIED',
      'GRIM IMPOSSIBLE',
      'GRIMMER IMPOSSIBLE',
      'VERIFIED',
      'VERIFIED',
      'GRIMMER IMPOSSIBLE',
      'GRIM IMPOSSIBLE',
      'INAPPLICABLE',
    ]
  );

  const spec2 = TABLE_SPECIMENS[1];
  const audits2 = spec2.rows.map((r) => auditTableRow(r, spec2.sdMode));
  assert.deepEqual(
    audits2.map((a) => a.status),
    [
      'INAPPLICABLE',
      'GRIM IMPOSSIBLE',
      'VERIFIED',
      'INAPPLICABLE',
      'GRIMMER IMPOSSIBLE',
      'VERIFIED',
    ]
  );
});

test('Batch table text parser handles CSV, TSV, and whitespace formats with headers', () => {
  const raw = [
    'Variable, Mean, SD, N, Items',
    'Control Group, 4.25, 1.13, 16, 1',
    'Treatment Group\t5.19\t1.42\t12',
    'Delayed Recall 3.20 1.36 10',
  ].join('\n');

  const rows = parseBatchTableText(raw);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].label, 'Control Group');
  assert.equal(rows[0].meanStr, '4.25');
  assert.equal(rows[1].meanStr, '5.19');
  assert.equal(rows[2].label, 'Delayed Recall');
  assert.equal(rows[2].sdStr, '1.36');
  assert.equal(rows[2].n, 10);
});
