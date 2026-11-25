import type {
  ParsedStatFinding,
  PComparator,
  SampleSizeDriftReport,
  StatTestType,
} from '../types/forensics';
import { evaluateTestPValue } from './distributions';

const ALPHA = 0.05;
const FLOAT_EPS = 1e-12;

/**
 * Extracts decimal precision directly from a raw numeric string (preserving trailing zeros).
 */
export function countDecimalPlaces(raw: string): number {
  const cleaned = raw.trim().replace(/^[+\-−–]/, '');
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx === -1) return 0;
  const frac = cleaned.slice(dotIdx + 1).replace(/[^0-9].*$/, '');
  return frac.length;
}

/**
 * Normalizes Unicode mathematical minus signs and dashes into ASCII hyphen-minus.
 */
function normalizeNumberToken(raw: string): string {
  return raw.trim().replace(/[−–—]/g, '-');
}

function normalizeComparator(raw: string): PComparator {
  const t = raw.trim();
  if (t === '≤' || t === '<=') return '<=';
  if (t === '≥' || t === '>=') return '>=';
  if (t === '<') return '<';
  if (t === '>') return '>';
  return '=';
}

function computePWindow(
  testType: StatTestType,
  statVal: number,
  statDecimals: number,
  df1: number | null,
  df2: number | null,
  tails: 1 | 2
): [number, number] {
  const halfStep = 0.5 * Math.pow(10, -statDecimals);
  const absStat = Math.abs(statVal);

  let lowStat = absStat - halfStep;
  let highStat = absStat + halfStep;

  if (testType === 'r') {
    lowStat = Math.max(0, lowStat);
    highStat = Math.min(0.9999999999, highStat);
  } else {
    lowStat = Math.max(0, lowStat);
  }

  // Higher |stat| -> smaller p-value; lower |stat| -> larger p-value
  const pMin = evaluateTestPValue(testType, highStat, df1, df2, tails);
  const pMax = evaluateTestPValue(testType, lowStat, df1, df2, tails);
  return [Math.min(pMin, pMax), Math.max(pMin, pMax)];
}

/**
 * Checks whether the reported p-value (with its comparator and rounding width)
 * is mathematically compatible with the permissible recomputed p-value interval [pMin, pMax].
 */
function isConsistentWithWindow(
  comparator: PComparator,
  pReported: number,
  pDecimals: number,
  pWindow: [number, number]
): boolean {
  const [pMin, pMax] = pWindow;
  const pHalfStep = 0.5 * Math.pow(10, -Math.max(1, pDecimals));

  switch (comparator) {
    case '=': {
      const repLo = Math.max(0, pReported - pHalfStep);
      const repHi = Math.min(1, pReported + pHalfStep);
      return pMax + FLOAT_EPS >= repLo && pMin - FLOAT_EPS <= repHi;
    }
    case '<':
    case '<=': {
      // Compatible if there exists a permissible true p <= pReported (or < pReported)
      return pMin <= pReported + FLOAT_EPS;
    }
    case '>':
    case '>=': {
      // Compatible if there exists a permissible true p >= pReported
      return pMax >= pReported - FLOAT_EPS;
    }
  }
}

/**
 * Classifies whether a discrepancy flips the alpha = 0.05 significance decision.
 */
function classifyVerdict(
  comparator: PComparator,
  pReported: number,
  pDecimals: number,
  pWindowTwo: [number, number]
): 'VERIFIED' | 'ROUNDING DRIFT' | 'DECISION ERROR' {
  if (isConsistentWithWindow(comparator, pReported, pDecimals, pWindowTwo)) {
    return 'VERIFIED';
  }

  const [pMin, pMax] = pWindowTwo;

  // Determine what the manuscript claimed regarding alpha = 0.05
  let claimedSignificant: boolean | null = null;
  if (comparator === '=' || comparator === '<' || comparator === '<=') {
    if (pReported < ALPHA || (comparator === '<' && Math.abs(pReported - ALPHA) < 1e-9)) {
      claimedSignificant = true;
    } else if (comparator === '=' && pReported >= ALPHA) {
      claimedSignificant = false;
    }
  } else if (comparator === '>' || comparator === '>=') {
    if (pReported >= ALPHA - 1e-9) {
      claimedSignificant = false;
    }
  }

  // Strictly non-significant under entire rounding window (even best-case pMin >= 0.05)
  const strictlyNonSig = pMin >= ALPHA - FLOAT_EPS;
  // Strictly significant under entire rounding window (even worst-case pMax < 0.05)
  const strictlySig = pMax < ALPHA - FLOAT_EPS;

  if (claimedSignificant === true && strictlyNonSig) {
    return 'DECISION ERROR';
  }
  if (claimedSignificant === false && strictlySig) {
    return 'DECISION ERROR';
  }

  return 'ROUNDING DRIFT';
}

function formatPVal(p: number): string {
  if (!Number.isFinite(p)) return 'NaN';
  if (p < 0.0001) return '< .0001';
  return p.toFixed(4).replace(/^0\./, '.');
}

function buildSummary(
  verdict: 'VERIFIED' | 'ROUNDING DRIFT' | 'DECISION ERROR',
  pRaw: string,
  pComp: PComparator,
  pComputed: number,
  pWindow: [number, number],
  oneTailedConsistent: boolean
): string {
  const [pMin, pMax] = pWindow;
  if (verdict === 'VERIFIED') {
    return `Reported p ${pComp} ${pRaw} falls within permissible rounding bounds [${formatPVal(pMin)}, ${formatPVal(pMax)}] (exact p = ${formatPVal(pComputed)}).`;
  }
  if (verdict === 'DECISION ERROR') {
    const tailNote = oneTailedConsistent
      ? ' Note: consistent only if a one-tailed test was silently applied.'
      : '';
    return `Significance reversal across α = .05: reported p ${pComp} ${pRaw}, but recomputed p = ${formatPVal(pComputed)} (window [${formatPVal(pMin)}, ${formatPVal(pMax)}]).${tailNote}`;
  }
  const tailNote = oneTailedConsistent ? ' (Consistent under one-tailed test.)' : '';
  return `Reported p ${pComp} ${pRaw} lies outside rounding tolerance [${formatPVal(pMin)}, ${formatPVal(pMax)}] (exact p = ${formatPVal(pComputed)}) without crossing α = .05.${tailNote}`;
}

interface RawExtractedTest {
  rawMatch: string;
  testType: StatTestType;
  df1: number | null;
  df2: number | null;
  sampleN: number | null;
  statRaw: string;
  pComparator: PComparator;
  pRaw: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Parses APA and empirical journal inline test statistics from text.
 * Supports: t(df), F(df1, df2), chi2/χ²/X²(df[, N=n]), r(df), and z.
 */
export function parseStatFindings(text: string, page?: number): ParsedStatFinding[] {
  const rawTests: RawExtractedTest[] = [];

  const numPat = '([+\\-−–]?\\d*\\.\\d+|[+\\-−–]?\\d+)';
  const pClausePat =
    '(?:[,;]\\s*|\\s+)(?:p\\s*([=<>≤≥]=?)\\s*(0?\\.\\d+|1\\.0+|1|0)|\\b(ns|n\\.s\\.)\\b)';

  const patterns: Array<{
    type: StatTestType;
    regex: RegExp;
    extract: (m: RegExpExecArray) => Omit<RawExtractedTest, 'rawMatch' | 'startIndex' | 'endIndex'> | null;
  }> = [
    // Student's t: t(42) = 1.91, p = .041
    {
      type: 't',
      regex: new RegExp(
        `\\bt\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*${numPat}${pClausePat}`,
        'gi'
      ),
      extract: (m) => {
        const df1 = Number.parseFloat(m[1]);
        const isNs = Boolean(m[5]);
        return {
          testType: 't',
          df1,
          df2: null,
          sampleN: null,
          statRaw: m[2],
          pComparator: isNs ? '>' : normalizeComparator(m[3]),
          pRaw: isNs ? '.05' : m[4],
        };
      },
    },
    // F-test: F(2, 27) = 3.35, p = .050
    {
      type: 'F',
      regex: new RegExp(
        `\\bF\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*[,;]\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*${numPat}${pClausePat}`,
        'g'
      ),
      extract: (m) => {
        const df1 = Number.parseFloat(m[1]);
        const df2 = Number.parseFloat(m[2]);
        const isNs = Boolean(m[6]);
        return {
          testType: 'F',
          df1,
          df2,
          sampleN: null,
          statRaw: m[3],
          pComparator: isNs ? '>' : normalizeComparator(m[4]),
          pRaw: isNs ? '.05' : m[5],
        };
      },
    },
    // Chi-square: χ²(1) = 3.84, p = .050 | chi2(2, N = 120) = 6.12, p = .047 | X²(1) = 4.10, p = .043
    {
      type: 'chi2',
      regex: new RegExp(
        `(?:χ²|χ2|chi2|chi\\^2|X²|X2)\\s*\\(\\s*(\\d+(?:\\.\\d+)?)(?:\\s*[,;]\\s*[Nn]\\s*=\\s*(\\d+))?\\s*\\)\\s*=\\s*${numPat}${pClausePat}`,
        'gi'
      ),
      extract: (m) => {
        const df1 = Number.parseFloat(m[1]);
        const sampleN = m[2] ? Number.parseInt(m[2], 10) : null;
        const isNs = Boolean(m[6]);
        return {
          testType: 'chi2',
          df1,
          df2: null,
          sampleN,
          statRaw: m[3],
          pComparator: isNs ? '>' : normalizeComparator(m[4]),
          pRaw: isNs ? '.05' : m[5],
        };
      },
    },
    // Pearson r: r(28) = .361, p = .050
    {
      type: 'r',
      regex: new RegExp(
        `\\br\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*${numPat}${pClausePat}`,
        'gi'
      ),
      extract: (m) => {
        const df1 = Number.parseFloat(m[1]);
        const isNs = Boolean(m[5]);
        return {
          testType: 'r',
          df1,
          df2: null,
          sampleN: null,
          statRaw: m[2],
          pComparator: isNs ? '>' : normalizeComparator(m[3]),
          pRaw: isNs ? '.05' : m[4],
        };
      },
    },
    // Standard Normal z: z = 1.96, p = .050
    {
      type: 'z',
      regex: new RegExp(`\\bz\\s*=\\s*${numPat}${pClausePat}`, 'gi'),
      extract: (m) => {
        const isNs = Boolean(m[4]);
        return {
          testType: 'z',
          df1: null,
          df2: null,
          sampleN: null,
          statRaw: m[1],
          pComparator: isNs ? '>' : normalizeComparator(m[2]),
          pRaw: isNs ? '.05' : m[3],
        };
      },
    },
  ];

  for (const spec of patterns) {
    let match: RegExpExecArray | null;
    while ((match = spec.regex.exec(text)) !== null) {
      const extracted = spec.extract(match);
      if (!extracted) continue;
      rawTests.push({
        ...extracted,
        rawMatch: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  // Sort by document appearance order and deduplicate overlapping spans
  rawTests.sort((a, b) => a.startIndex - b.startIndex);
  const deduped: RawExtractedTest[] = [];
  for (const item of rawTests) {
    const prev = deduped[deduped.length - 1];
    if (prev && item.startIndex < prev.endIndex) {
      continue;
    }
    deduped.push(item);
  }

  return deduped.map((raw, idx) => {
    const statValue = Number.parseFloat(normalizeNumberToken(raw.statRaw));
    const statDecimals = countDecimalPlaces(raw.statRaw);
    const pReported = Number.parseFloat(normalizeNumberToken(raw.pRaw));
    const pDecimals = countDecimalPlaces(raw.pRaw);

    const pComputedTwoTailed = evaluateTestPValue(raw.testType, statValue, raw.df1, raw.df2, 2);
    const isDirectionalEligible = raw.testType === 't' || raw.testType === 'r' || raw.testType === 'z';
    const pComputedOneTailed = isDirectionalEligible
      ? evaluateTestPValue(raw.testType, statValue, raw.df1, raw.df2, 1)
      : pComputedTwoTailed;

    const pWindowTwoTailed = computePWindow(
      raw.testType,
      statValue,
      statDecimals,
      raw.df1,
      raw.df2,
      2
    );
    const pWindowOneTailed = isDirectionalEligible
      ? computePWindow(raw.testType, statValue, statDecimals, raw.df1, raw.df2, 1)
      : pWindowTwoTailed;

    const verdict = classifyVerdict(raw.pComparator, pReported, pDecimals, pWindowTwoTailed);
    const oneTailedConsistent =
      isDirectionalEligible &&
      verdict !== 'VERIFIED' &&
      isConsistentWithWindow(raw.pComparator, pReported, pDecimals, pWindowOneTailed);

    return {
      id: `stat-${page ?? 1}-${idx + 1}`,
      rawMatch: raw.rawMatch,
      testType: raw.testType,
      df1: raw.df1,
      df2: raw.df2,
      sampleN: raw.sampleN,
      statRaw: raw.statRaw,
      statValue,
      statDecimals,
      pComparator: raw.pComparator,
      pRaw: raw.pRaw,
      pReported,
      pDecimals,
      pComputedTwoTailed,
      pComputedOneTailed,
      pWindowTwoTailed,
      pWindowOneTailed,
      oneTailedConsistent,
      verdict,
      summary: buildSummary(
        verdict,
        raw.pRaw,
        raw.pComparator,
        pComputedTwoTailed,
        pWindowTwoTailed,
        oneTailedConsistent
      ),
      startIndex: raw.startIndex,
      endIndex: raw.endIndex,
      page,
    };
  });
}

/**
 * Flags unexplained drops or shifts in implied sample size N across extracted findings.
 * Implied N mapping:
 * - chi2 with explicit N: N
 * - r(df): df + 2
 * - t(df): integer df -> df + 2 (two-sample baseline; Welch fractional df ignored for drift)
 * - F(df1, df2): df1 + df2 + 1
 */
export function detectSampleSizeDrift(findings: ParsedStatFinding[]): SampleSizeDriftReport {
  const impliedNs: SampleSizeDriftReport['impliedNs'] = [];

  for (const f of findings) {
    let impliedN: number | null = null;
    if (f.testType === 'chi2' && f.sampleN !== null) {
      impliedN = f.sampleN;
    } else if (f.testType === 'r' && f.df1 !== null && Number.isInteger(f.df1)) {
      impliedN = f.df1 + 2;
    } else if (f.testType === 't' && f.df1 !== null && Number.isInteger(f.df1)) {
      impliedN = f.df1 + 2;
    } else if (
      f.testType === 'F' &&
      f.df1 !== null &&
      f.df2 !== null &&
      Number.isInteger(f.df1) &&
      Number.isInteger(f.df2)
    ) {
      impliedN = f.df1 + f.df2 + 1;
    }

    if (impliedN !== null && impliedN > 0) {
      impliedNs.push({
        findingId: f.id,
        testType: f.testType,
        impliedN,
        rawMatch: f.rawMatch,
      });
    }
  }

  if (impliedNs.length === 0) {
    return {
      hasDrift: false,
      impliedNs: [],
      minN: null,
      maxN: null,
      distinctNs: [],
      deltaN: 0,
      message: 'No integer degrees of freedom available for sample-size drift tracking.',
    };
  }

  const values = impliedNs.map((d) => d.impliedN);
  const distinctNs = Array.from(new Set(values)).sort((a, b) => a - b);
  const minN = distinctNs[0];
  const maxN = distinctNs[distinctNs.length - 1];
  const deltaN = maxN - minN;
  const hasDrift = distinctNs.length > 1 && deltaN >= 2;

  const message = hasDrift
    ? `Sample-size drift detected: implied N varies from ${minN} to ${maxN} (ΔN = ${deltaN}) across ${impliedNs.length} tests.`
    : `Sample size consistent across ${impliedNs.length} tests (implied N = ${maxN}${deltaN === 1 ? ' ± 1' : ''}).`;

  return {
    hasDrift,
    impliedNs,
    minN,
    maxN,
    distinctNs,
    deltaN,
    message,
  };
}
