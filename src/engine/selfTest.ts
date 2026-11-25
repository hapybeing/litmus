import type { SelfTestAssertion, SelfTestReport } from '../types/forensics';
import {
  chiSquarePValue,
  fPValue,
  normalZPValue,
  pearsonRPValue,
  studentTPValue,
} from './distributions';
import { auditTableRow } from './grim';
import { parseStatFindings } from './statParser';

const TOLERANCE = 1e-4;

/**
 * Deterministic startup verification suite of 13 textbook ground-truth mathematical assertions.
 * Runs in < 2ms with zero side effects.
 */
export function runKernelSelfTest(): SelfTestReport {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const assertions: SelfTestAssertion[] = [];

  // 1. Student's t(30) = 2.04227 -> p = 0.0500
  {
    const p = studentTPValue(2.04227, 30, 2);
    const err = Math.abs(p - 0.05);
    assertions.push({
      id: 'dist-t-30',
      category: 'DISTRIBUTIONS',
      name: "Student's t two-tailed critical point (df = 30)",
      inputSummary: 't(30) = 2.04227',
      expected: 'p = 0.050000',
      computed: `p = ${p.toFixed(6)}`,
      absError: err,
      passed: err < TOLERANCE,
    });
  }

  // 2. Student's t(100) = 1.98397 -> p = 0.0500
  {
    const p = studentTPValue(1.98397, 100, 2);
    const err = Math.abs(p - 0.05);
    assertions.push({
      id: 'dist-t-100',
      category: 'DISTRIBUTIONS',
      name: "Student's t two-tailed critical point (df = 100)",
      inputSummary: 't(100) = 1.98397',
      expected: 'p = 0.050000',
      computed: `p = ${p.toFixed(6)}`,
      absError: err,
      passed: err < TOLERANCE,
    });
  }

  // 3. F(2, 27) = 3.35413 -> p = 0.0500
  {
    const p = fPValue(3.35413, 2, 27);
    const err = Math.abs(p - 0.05);
    assertions.push({
      id: 'dist-f-2-27',
      category: 'DISTRIBUTIONS',
      name: 'Snedecor F upper-tail critical point (df = 2, 27)',
      inputSummary: 'F(2, 27) = 3.35413',
      expected: 'p = 0.050000',
      computed: `p = ${p.toFixed(6)}`,
      absError: err,
      passed: err < TOLERANCE,
    });
  }

  // 4. chi2(1) = 3.84146 -> p = 0.0500
  {
    const p = chiSquarePValue(3.84146, 1);
    const err = Math.abs(p - 0.05);
    assertions.push({
      id: 'dist-chi2-1',
      category: 'DISTRIBUTIONS',
      name: 'Chi-square upper-tail critical point (df = 1)',
      inputSummary: 'χ²(1) = 3.84146',
      expected: 'p = 0.050000',
      computed: `p = ${p.toFixed(6)}`,
      absError: err,
      passed: err < TOLERANCE,
    });
  }

  // 5. Normal z = 1.95996 -> p = 0.0500
  {
    const p = normalZPValue(1.95996, 2);
    const err = Math.abs(p - 0.05);
    assertions.push({
      id: 'dist-z',
      category: 'DISTRIBUTIONS',
      name: 'Standard normal z two-tailed critical point',
      inputSummary: 'z = 1.95996',
      expected: 'p = 0.050000',
      computed: `p = ${p.toFixed(6)}`,
      absError: err,
      passed: err < TOLERANCE,
    });
  }

  // 6. Pearson r(28) = 0.3610 -> p = 0.0500
  {
    const p = pearsonRPValue(0.361, 28, 2);
    const err = Math.abs(p - 0.05);
    assertions.push({
      id: 'dist-r-28',
      category: 'DISTRIBUTIONS',
      name: 'Pearson r exact t-transform (df = 28)',
      inputSummary: 'r(28) = 0.3610',
      expected: 'p = 0.050000',
      computed: `p = ${p.toFixed(6)}`,
      absError: err,
      passed: err < 2e-4,
    });
  }

  // 7. StatParser Decision Error: t(42) = 1.91, p = .041 (true p ≈ .063)
  {
    const findings = parseStatFindings('Treatment effect was reported as t(42) = 1.91, p = .041.');
    const f = findings[0];
    const passed = Boolean(f && f.verdict === 'DECISION ERROR' && f.pComputedTwoTailed > 0.06);
    assertions.push({
      id: 'parser-decision-err',
      category: 'STAT PARSER',
      name: 'APA Decision Error detection across α = 0.05',
      inputSummary: 't(42) = 1.91, p = .041',
      expected: 'DECISION ERROR (p ≈ .0630)',
      computed: f ? `${f.verdict} (p = ${f.pComputedTwoTailed.toFixed(4)})` : 'NO MATCH',
      absError: f ? Math.abs(f.pComputedTwoTailed - 0.06299) : null,
      passed,
    });
  }

  // 8. StatParser Rounding-Window Grace: t(30) = 2.04, p = .050 -> VERIFIED
  {
    const findings = parseStatFindings('Borderline contrast t(30) = 2.04, p = .050.');
    const f = findings[0];
    const passed = Boolean(f && f.verdict === 'VERIFIED');
    assertions.push({
      id: 'parser-rounding-grace',
      category: 'STAT PARSER',
      name: 'Rounding-window protection on borderline t-statistic',
      inputSummary: 't(30) = 2.04, p = .050',
      expected: 'VERIFIED (2.0423 ∈ [2.035, 2.045])',
      computed: f
        ? `${f.verdict} ([${f.pWindowTwoTailed[0].toFixed(4)}, ${f.pWindowTwoTailed[1].toFixed(4)}])`
        : 'NO MATCH',
      absError: 0,
      passed,
    });
  }

  // 9. Classic GRIM failure: M = "5.19", N = 12, k = 1 -> GRIM IMPOSSIBLE
  {
    const audit = auditTableRow({
      id: 't-grim-fail',
      label: 'Classic GRIM',
      meanStr: '5.19',
      sdStr: '',
      n: 12,
      items: 1,
    });
    assertions.push({
      id: 'grim-classic-fail',
      category: 'GRIM',
      name: 'Brown & Heathers integer granularity exclusion',
      inputSummary: 'M = "5.19", N = 12, k = 1',
      expected: 'GRIM IMPOSSIBLE',
      computed: audit.status,
      absError: 0,
      passed: audit.status === 'GRIM IMPOSSIBLE',
    });
  }

  // 10. Classic GRIM pass: M = "5.17", N = 12, k = 1 -> VERIFIED (S = 62)
  {
    const audit = auditTableRow({
      id: 't-grim-pass',
      label: 'Classic GRIM Pass',
      meanStr: '5.17',
      sdStr: '',
      n: 12,
      items: 1,
    });
    const passed = audit.status === 'VERIFIED' && audit.grim.impliedSum === 62;
    assertions.push({
      id: 'grim-classic-pass',
      category: 'GRIM',
      name: 'Brown & Heathers exact implied integer sum',
      inputSummary: 'M = "5.17", N = 12, k = 1',
      expected: 'VERIFIED (S = 62)',
      computed: `${audit.status} (S = ${audit.grim.impliedSum})`,
      absError: 0,
      passed,
    });
  }

  // 11. GRIMMER granularity failure (GRIM passes, SD fails): M = "3.20", SD = "1.35", N = 10, k = 1
  {
    const audit = auditTableRow(
      {
        id: 't-grimmer-gap',
        label: 'GRIMMER Gap',
        meanStr: '3.20',
        sdStr: '1.35',
        n: 10,
        items: 1,
      },
      'sample'
    );
    const passed =
      audit.grim.consistent &&
      audit.grim.impliedSum === 32 &&
      audit.status === 'GRIMMER IMPOSSIBLE';
    assertions.push({
      id: 'grimmer-gap-fail',
      category: 'GRIMMER',
      name: 'GRIMMER exclusion when Mean passes GRIM (SD gap)',
      inputSummary: 'M = "3.20", SD = "1.35", N = 10',
      expected: 'GRIMMER IMPOSSIBLE (S = 32)',
      computed: `${audit.status} (S = ${audit.grim.impliedSum})`,
      absError: 0,
      passed,
    });
  }

  // 12. Pure Allard (2018) parity exclusion: M = "3.20", SD = "1.36", N = 10 (Q = 119 ODD vs S = 32 EVEN)
  {
    const audit = auditTableRow(
      {
        id: 't-grimmer-parity',
        label: 'GRIMMER Parity',
        meanStr: '3.20',
        sdStr: '1.36',
        n: 10,
        items: 1,
      },
      'sample'
    );
    const passed =
      audit.grim.consistent &&
      audit.status === 'GRIMMER IMPOSSIBLE' &&
      Boolean(audit.grimmer?.parityForbiddenInWindow.includes(119));
    assertions.push({
      id: 'grimmer-parity-fail',
      category: 'GRIMMER',
      name: 'Allard (2018) parity invariant exclusion (Q ≡ S mod 2)',
      inputSummary: 'M = "3.20", SD = "1.36", N = 10',
      expected: 'GRIMMER IMPOSSIBLE (Q=119 ODD ≠ S=32 EVEN)',
      computed: `${audit.status} (ghost Q = ${audit.grimmer?.parityForbiddenInWindow.join(',') || 'none'})`,
      absError: 0,
      passed,
    });
  }

  // 13. Multi-item scale GRIM pass: M = "4.15", N = 10, k = 2 -> VERIFIED (N_eff = 20, S = 83)
  {
    const audit = auditTableRow({
      id: 't-grim-multi',
      label: 'Multi-Item GRIM',
      meanStr: '4.15',
      sdStr: '',
      n: 10,
      items: 2,
    });
    const passed =
      audit.status === 'VERIFIED' && audit.grim.nEff === 20 && audit.grim.impliedSum === 83;
    assertions.push({
      id: 'grim-multi-item',
      category: 'GRIM',
      name: 'Multi-item scale granularity multiplier (N × k)',
      inputSummary: 'M = "4.15", N = 10, k = 2',
      expected: 'VERIFIED (N_eff = 20, S = 83)',
      computed: `${audit.status} (N_eff = ${audit.grim.nEff}, S = ${audit.grim.impliedSum})`,
      absError: 0,
      passed,
    });
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const passedCount = assertions.filter((a) => a.passed).length;

  return {
    passedCount,
    totalCount: assertions.length,
    allPassed: passedCount === assertions.length,
    elapsedMs: Math.max(0.01, t1 - t0),
    assertions,
  };
}
