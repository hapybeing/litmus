export type LabMode = 'manuscript' | 'table' | 'multiverse';

export type VerdictType =
  | 'VERIFIED'
  | 'GRIM IMPOSSIBLE'
  | 'GRIMMER IMPOSSIBLE'
  | 'DECISION ERROR'
  | 'ROUNDING DRIFT'
  | 'INAPPLICABLE';

export type StatTestType = 't' | 'F' | 'chi2' | 'r' | 'z';

export type PComparator = '=' | '<' | '>' | '<=' | '>=';

export interface ParsedStatFinding {
  id: string;
  rawMatch: string;
  testType: StatTestType;
  df1: number | null;
  df2: number | null;
  sampleN: number | null;
  statRaw: string;
  statValue: number;
  statDecimals: number;
  pComparator: PComparator;
  pRaw: string;
  pReported: number;
  pDecimals: number;
  /** Exact recomputed two-tailed p-value at point estimate */
  pComputedTwoTailed: number;
  /** Exact recomputed one-tailed p-value at point estimate */
  pComputedOneTailed: number;
  /** Permissible two-tailed p-value interval across [T - 0.5*10^-d, T + 0.5*10^-d] */
  pWindowTwoTailed: [number, number];
  /** Permissible one-tailed p-value interval across [T - 0.5*10^-d, T + 0.5*10^-d] */
  pWindowOneTailed: [number, number];
  /** Whether a one-tailed interpretation would reconcile the reported p-value */
  oneTailedConsistent: boolean;
  verdict: 'VERIFIED' | 'ROUNDING DRIFT' | 'DECISION ERROR';
  summary: string;
  startIndex: number;
  endIndex: number;
  page?: number;
}

export interface SampleSizeDriftReport {
  hasDrift: boolean;
  impliedNs: Array<{ findingId: string; testType: StatTestType; impliedN: number; rawMatch: string }>;
  minN: number | null;
  maxN: number | null;
  distinctNs: number[];
  deltaN: number;
  message: string;
}

export type SdFormulaMode = 'sample' | 'population';

export interface TableRowInput {
  id: string;
  label: string;
  meanStr: string;
  sdStr: string;
  n: number;
  items: number;
  note?: string;
}

export interface MeanLatticePoint {
  sum: number;
  mean: number;
  formatted: string;
  delta: number;
  isWithinWindow: boolean;
  isMatch: boolean;
}

export interface SdLatticePoint {
  q: number;
  parity: 'EVEN' | 'ODD';
  parityValid: boolean;
  sd: number;
  formatted: string;
  delta: number;
  isWithinWindow: boolean;
  isMatch: boolean;
}

export interface GrimResult {
  applicable: boolean;
  consistent: boolean;
  reason: string;
  nEff: number;
  decimals: number;
  reportedMean: number;
  windowLow: number;
  windowHigh: number;
  impliedSum: number | null;
  validSums: number[];
  matchedRoundingRule: 'exact' | 'half-up' | 'half-even' | 'both' | 'none';
  nearestPossibleMeans: MeanLatticePoint[];
}

export interface GrimmerResult {
  applicable: boolean;
  consistent: boolean;
  reason: string;
  formulaMode: SdFormulaMode;
  sdDecimals: number;
  reportedSd: number;
  sdWindowLow: number;
  sdWindowHigh: number;
  impliedSum: number | null;
  sumParity: 'EVEN' | 'ODD' | null;
  qMinDiscrete: number | null;
  qWindowLow: number | null;
  qWindowHigh: number | null;
  /** Integers in [qWindowLow, qWindowHigh] with Q >= qMinDiscrete */
  allIntegersInWindow: number[];
  /** Subset of allIntegersInWindow that also pass Q === S (mod 2) and exact achievability */
  validParityCandidates: number[];
  /** Parity-forbidden ghost integers inside the SD rounding window */
  parityForbiddenInWindow: number[];
  nearestPossibleSDs: SdLatticePoint[];
  matchedRoundingRule: 'exact' | 'half-up' | 'half-even' | 'both' | 'none';
}

export interface TableRowAudit {
  input: TableRowInput;
  status: 'VERIFIED' | 'GRIM IMPOSSIBLE' | 'GRIMMER IMPOSSIBLE' | 'INAPPLICABLE';
  grim: GrimResult;
  grimmer: GrimmerResult | null;
  executiveSummary: string;
  proofSteps: string[];
}

export interface TableSpecimen {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  sourceNote: string;
  sdMode: SdFormulaMode;
  rows: TableRowInput[];
}

export interface SelfTestAssertion {
  id: string;
  category: 'DISTRIBUTIONS' | 'STAT PARSER' | 'GRIM' | 'GRIMMER';
  name: string;
  inputSummary: string;
  expected: string;
  computed: string;
  absError: number | null;
  passed: boolean;
}

export interface SelfTestReport {
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  elapsedMs: number;
  assertions: SelfTestAssertion[];
}

/** PDF user-space bounding box [x1, y1, x2, y2] (bottom-left origin, in PDF points) */
export interface PdfBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PdfFinding extends ParsedStatFinding {
  page: number;
  /** One or more per-line PDF user-space rectangles covering the matched statistical clause */
  rects: PdfBoundingBox[];
  /** Surrounding sentence context extracted from the manuscript page */
  contextSnippet: string;
}

export interface PdfPageSummary {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  text: string;
  findingCount: number;
}

export interface ManuscriptAuditResult {
  fileName: string;
  fileSizeBytes: number;
  sha256Short: string;
  pageCount: number;
  pages: PdfPageSummary[];
  findings: PdfFinding[];
  driftReport: SampleSizeDriftReport;
  extractedTableRows: TableRowInput[];
  extractedTablePages: number[];
  extractionMs: number;
}

