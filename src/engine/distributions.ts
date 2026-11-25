import type { StatTestType } from '../types/forensics';

const LANCZOS_G = 7;
const LANCZOS_COEFFS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

const FPMIN = 1e-30;
const EPS = 1e-13;
const MAX_ITER = 300;
const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI);
const SQRT_2 = Math.SQRT2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * 9-term Lanczos approximation to ln(Gamma(z)) (~15 digits double precision).
 */
export function logGamma(z: number): number {
  if (!Number.isFinite(z)) return Number.NaN;
  if (z <= 0 && Number.isInteger(z)) return Number.POSITIVE_INFINITY;

  if (z < 0.5) {
    const sinPiZ = Math.sin(Math.PI * z);
    if (sinPiZ === 0) return Number.POSITIVE_INFINITY;
    return Math.log(Math.PI / Math.abs(sinPiZ)) - logGamma(1 - z);
  }

  const u = z - 1;
  let x = LANCZOS_COEFFS[0];
  for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
    x += LANCZOS_COEFFS[i] / (u + i);
  }
  const t = u + LANCZOS_G + 0.5;
  return HALF_LOG_2PI + (u + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Modified Lentz continued fraction for the incomplete beta function.
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) {
      break;
    }
  }

  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b) with symmetry transformation.
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (a <= 0 || b <= 0 || !Number.isFinite(x)) return Number.NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const logBt =
    logGamma(a + b) -
    logGamma(a) -
    logGamma(b) +
    a * Math.log(x) +
    b * Math.log(1 - x);
  const bt = Math.exp(logBt);

  if (x < (a + 1) / (a + b + 2)) {
    return clampProb((bt * betaContinuedFraction(a, b, x)) / a);
  }
  return clampProb(1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b);
}

/**
 * Series expansion for regularized lower incomplete gamma P(a, x), optimal for x < a + 1.
 */
function gammaSeriesP(a: number, x: number): number {
  const gln = logGamma(a);
  if (x <= 0) return 0;

  let ap = a;
  let term = 1 / a;
  let sum = term;

  for (let n = 1; n <= MAX_ITER; n++) {
    ap += 1;
    term *= x / ap;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPS) {
      break;
    }
  }

  return clampProb(sum * Math.exp(-x + a * Math.log(x) - gln));
}

/**
 * Modified Lentz continued fraction for regularized upper incomplete gamma Q(a, x), optimal for x >= a + 1.
 */
function gammaContinuedFractionQ(a: number, x: number): number {
  const gln = logGamma(a);

  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i <= MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) {
      break;
    }
  }

  return clampProb(Math.exp(-x + a * Math.log(x) - gln) * h);
}

/**
 * Regularized lower incomplete gamma P(a, x).
 */
export function regularizedIncompleteGammaP(a: number, x: number): number {
  if (a <= 0 || x < 0 || !Number.isFinite(x)) return Number.NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    return gammaSeriesP(a, x);
  }
  return clampProb(1 - gammaContinuedFractionQ(a, x));
}

/**
 * Regularized upper incomplete gamma Q(a, x) = 1 - P(a, x).
 */
export function regularizedIncompleteGammaQ(a: number, x: number): number {
  if (a <= 0 || x < 0 || !Number.isFinite(x)) return Number.NaN;
  if (x === 0) return 1;
  if (x < a + 1) {
    return clampProb(1 - gammaSeriesP(a, x));
  }
  return gammaContinuedFractionQ(a, x);
}

/**
 * High-precision complementary error function erfc(x) via Q(1/2, x^2) (< 1e-15 error).
 */
export function erfc(x: number): number {
  if (!Number.isFinite(x)) {
    if (x === Number.POSITIVE_INFINITY) return 0;
    if (x === Number.NEGATIVE_INFINITY) return 2;
    return Number.NaN;
  }
  if (x === 0) return 1;
  const ax = Math.abs(x);
  const val = regularizedIncompleteGammaQ(0.5, ax * ax);
  return x >= 0 ? val : 2 - val;
}

/**
 * Student's t probability density function f(x; df).
 */
export function studentTPdf(x: number, df: number): number {
  if (df <= 0 || !Number.isFinite(x)) return Number.NaN;
  const logNorm = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  const logKernel = -((df + 1) / 2) * Math.log(1 + (x * x) / df);
  return Math.exp(logNorm + logKernel);
}

/**
 * Exact Student's t p-value (default two-tailed).
 */
export function studentTPValue(t: number, df: number, tails: 1 | 2 = 2): number {
  if (df <= 0 || !Number.isFinite(t)) return Number.NaN;
  const x = df / (df + t * t);
  const pTwo = regularizedIncompleteBeta(x, df / 2, 0.5);
  return tails === 2 ? pTwo : clampProb(pTwo / 2);
}

/**
 * Snedecor's F probability density function f(x; df1, df2).
 */
export function fPdf(x: number, df1: number, df2: number): number {
  if (df1 <= 0 || df2 <= 0 || !Number.isFinite(x)) return Number.NaN;
  if (x < 0) return 0;
  if (x === 0) {
    if (df1 < 2) return Number.POSITIVE_INFINITY;
    if (df1 === 2) return 1;
    return 0;
  }
  const half1 = df1 / 2;
  const half2 = df2 / 2;
  const logCoeff =
    logGamma(half1 + half2) -
    logGamma(half1) -
    logGamma(half2) +
    half1 * Math.log(df1 / df2);
  const logBody = (half1 - 1) * Math.log(x) - (half1 + half2) * Math.log(1 + (df1 * x) / df2);
  return Math.exp(logCoeff + logBody);
}

/**
 * Exact upper-tail F-distribution p-value.
 */
export function fPValue(f: number, df1: number, df2: number): number {
  if (df1 <= 0 || df2 <= 0 || !Number.isFinite(f)) return Number.NaN;
  if (f <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return regularizedIncompleteBeta(x, df2 / 2, df1 / 2);
}

/**
 * Chi-square probability density function f(x; df).
 */
export function chiSquarePdf(x: number, df: number): number {
  if (df <= 0 || !Number.isFinite(x)) return Number.NaN;
  if (x < 0) return 0;
  if (x === 0) {
    if (df < 2) return Number.POSITIVE_INFINITY;
    if (df === 2) return 0.5;
    return 0;
  }
  const k2 = df / 2;
  return Math.exp(-k2 * Math.LN2 - logGamma(k2) + (k2 - 1) * Math.log(x) - x / 2);
}

/**
 * Exact upper-tail Chi-square p-value.
 */
export function chiSquarePValue(chi2: number, df: number): number {
  if (df <= 0 || !Number.isFinite(chi2)) return Number.NaN;
  if (chi2 <= 0) return 1;
  return regularizedIncompleteGammaQ(df / 2, chi2 / 2);
}

/**
 * Exact Pearson r p-value via t = r * sqrt(df / (1 - r^2)).
 */
export function pearsonRPValue(r: number, df: number, tails: 1 | 2 = 2): number {
  if (df <= 0 || !Number.isFinite(r)) return Number.NaN;
  const ar = Math.abs(r);
  if (ar >= 1) return 0;
  if (ar === 0) return tails === 2 ? 1 : 0.5;
  const t = ar * Math.sqrt(df / (1 - ar * ar));
  return studentTPValue(t, df, tails);
}

/**
 * Standard Normal probability density function phi(x).
 */
export function normalZPdf(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Exact Standard Normal z p-value (default two-tailed).
 */
export function normalZPValue(z: number, tails: 1 | 2 = 2): number {
  if (!Number.isFinite(z)) return Number.NaN;
  const pTwo = clampProb(erfc(Math.abs(z) / SQRT_2));
  return tails === 2 ? pTwo : clampProb(pTwo / 2);
}

/**
 * Evaluates p-value for any supported test type.
 */
export function evaluateTestPValue(
  testType: StatTestType,
  stat: number,
  df1: number | null,
  df2: number | null,
  tails: 1 | 2 = 2
): number {
  switch (testType) {
    case 't':
      return studentTPValue(stat, df1 ?? 1, tails);
    case 'F':
      return fPValue(stat, df1 ?? 1, df2 ?? 1);
    case 'chi2':
      return chiSquarePValue(stat, df1 ?? 1);
    case 'r':
      return pearsonRPValue(stat, df1 ?? 1, tails);
    case 'z':
      return normalZPValue(stat, tails);
  }
}

/**
 * Binary-search critical value for plotting exact alpha rejection regions.
 * For symmetric tests (t, z, r), returns the positive critical threshold.
 * For right-tailed tests (F, chi2), returns the upper critical threshold.
 */
export function criticalValue(
  testType: StatTestType,
  df1: number | null,
  df2: number | null,
  alpha: number = 0.05,
  tails: 1 | 2 = 2
): number {
  if (alpha <= 0 || alpha >= 1) return Number.NaN;

  if (testType === 'r') {
    const tCrit = criticalValue('t', df1 ?? 1, null, alpha, tails);
    const df = df1 ?? 1;
    return tCrit / Math.sqrt(tCrit * tCrit + df);
  }

  let lo = 0;
  let hi = 1;

  const evalP = (v: number): number => {
    switch (testType) {
      case 't':
        return studentTPValue(v, df1 ?? 1, tails);
      case 'F':
        return fPValue(v, df1 ?? 1, df2 ?? 1);
      case 'chi2':
        return chiSquarePValue(v, df1 ?? 1);
      case 'z':
        return normalZPValue(v, tails);
      default:
        return 1;
    }
  };

  // Exponentially bracket upper bound until p(hi) <= alpha
  let guard = 0;
  while (evalP(hi) > alpha && guard < 80) {
    hi *= 2;
    guard++;
  }

  // Bisect to full double precision
  for (let i = 0; i < 90; i++) {
    const mid = 0.5 * (lo + hi);
    if (evalP(mid) > alpha) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-12 * Math.max(1, hi)) {
      break;
    }
  }

  return 0.5 * (lo + hi);
}

function clampProb(p: number): number {
  if (!Number.isFinite(p)) return Number.NaN;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}
