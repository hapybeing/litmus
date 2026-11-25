import type {
  GrimmerResult,
  GrimResult,
  MeanLatticePoint,
  SdFormulaMode,
  SdLatticePoint,
  TableRowAudit,
  TableRowInput,
} from '../types/forensics';

const FLOAT_GUARD = 1e-9;

/**
 * Counts decimal places directly from the raw user string so trailing zeros
 * (e.g., "3.20" -> 2 vs "3.2" -> 1) are strictly preserved.
 */
export function getDecimalPrecision(raw: string): number {
  const cleaned = raw.trim().replace(/^[+\-−–]/, '');
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx === -1) return 0;
  const frac = cleaned.slice(dotIdx + 1).replace(/[^0-9].*$/, '');
  return frac.length;
}

/**
 * Round half away from zero at `decimals` places, with IEEE-754 float guard.
 */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  const sign = scaled < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(scaled) + 0.5 + FLOAT_GUARD)) / factor;
}

/**
 * Round half to even (banker's rounding — R / Python / IEEE default) at `decimals` places.
 */
export function roundHalfToEven(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  const floorVal = Math.floor(scaled);
  const frac = scaled - floorVal;

  if (Math.abs(frac - 0.5) <= FLOAT_GUARD) {
    const evenInt = floorVal % 2 === 0 ? floorVal : floorVal + 1;
    return evenInt / factor;
  }
  return Math.round(scaled) / factor;
}

function checkRoundingMatch(
  candidate: number,
  target: number,
  decimals: number
): { matches: boolean; rule: 'exact' | 'half-up' | 'half-even' | 'both' | 'none' } {
  const factor = Math.pow(10, decimals);
  const targetScaled = Math.round(target * factor);
  const candidateScaled = candidate * factor;

  if (Math.abs(candidateScaled - targetScaled) <= FLOAT_GUARD) {
    return { matches: true, rule: 'exact' };
  }

  const hu = Math.round(roundHalfUp(candidate, decimals) * factor) === targetScaled;
  const he = Math.round(roundHalfToEven(candidate, decimals) * factor) === targetScaled;

  if (hu && he) return { matches: true, rule: 'both' };
  if (hu) return { matches: true, rule: 'half-up' };
  if (he) return { matches: true, rule: 'half-even' };
  return { matches: false, rule: 'none' };
}

function parityOf(intVal: number): 'EVEN' | 'ODD' {
  return ((intVal % 2) + 2) % 2 === 0 ? 'EVEN' : 'ODD';
}

/**
 * Exact discrete Cauchy-Schwarz minimum of Q = sum(y_i^2) over N integers summing to S.
 * Achieved when (N - r) values equal q = floor(S / N) and r values equal q + 1.
 */
export function discreteMinSumOfSquares(sumS: number, n: number): number {
  const q = Math.floor(sumS / n);
  const r = sumS - n * q; // Guaranteed 0 <= r < n even for negative sumS
  return (n - r) * q * q + r * (q + 1) * (q + 1);
}

/**
 * Verifies parity and exact integer achievability for sum-of-squares Q given sum S and sample size N.
 * For N = 2, 2Q - S^2 = (y_1 - y_2)^2 must be a non-negative perfect square.
 */
function isAchievableIntegerQ(q: number, sumS: number, n: number): boolean {
  const qMin = discreteMinSumOfSquares(sumS, n);
  if (q < qMin) return false;
  if (parityOf(q) !== parityOf(sumS)) return false;

  if (n === 2) {
    const disc = 2 * q - sumS * sumS;
    if (disc < 0) return false;
    const root = Math.round(Math.sqrt(disc));
    return root * root === disc;
  }

  return true;
}

/**
 * Exact Brown & Heathers GRIM test with multi-item scale support (k >= 1).
 */
export function evaluateGrim(meanStr: string, n: number, items: number = 1): GrimResult {
  const trimmed = meanStr.trim().replace(/[−–—]/g, '-');
  const reportedMean = Number.parseFloat(trimmed);
  const decimals = getDecimalPrecision(trimmed);
  const safeItems = Math.max(1, Math.floor(items));
  const safeN = Math.floor(n);
  const nEff = safeN * safeItems;

  const halfStep = 0.5 * Math.pow(10, -decimals);
  const windowLow = reportedMean - halfStep;
  const windowHigh = reportedMean + halfStep;

  if (!Number.isFinite(reportedMean) || safeN < 1) {
    return {
      applicable: false,
      consistent: false,
      reason: 'Enter a valid numeric mean and integer sample size N ≥ 1.',
      nEff: 0,
      decimals,
      reportedMean: Number.NaN,
      windowLow: Number.NaN,
      windowHigh: Number.NaN,
      impliedSum: null,
      validSums: [],
      matchedRoundingRule: 'none',
      nearestPossibleMeans: [],
    };
  }

  const maxGranularN = Math.pow(10, decimals);
  if (nEff > maxGranularN) {
    const centerS = Math.round(reportedMean * nEff);
    const lattice = buildMeanLattice(centerS, nEff, reportedMean, decimals, windowLow, windowHigh);
    return {
      applicable: false,
      consistent: true,
      reason: `Effective granularity N × k = ${nEff} exceeds 10^${decimals} = ${maxGranularN}; every ${decimals}-decimal mean is mathematically achievable.`,
      nEff,
      decimals,
      reportedMean,
      windowLow,
      windowHigh,
      impliedSum: centerS,
      validSums: [centerS],
      matchedRoundingRule: 'both',
      nearestPossibleMeans: lattice,
    };
  }

  const centerS = Math.round(reportedMean * nEff);
  const minSearchS = Math.floor(nEff * (windowLow - FLOAT_GUARD)) - 1;
  const maxSearchS = Math.ceil(nEff * (windowHigh + FLOAT_GUARD)) + 1;

  const validSums: number[] = [];
  let matchedRule: GrimResult['matchedRoundingRule'] = 'none';

  for (let s = minSearchS; s <= maxSearchS; s++) {
    const candMean = s / nEff;
    const check = checkRoundingMatch(candMean, reportedMean, decimals);
    if (check.matches) {
      validSums.push(s);
      if (matchedRule === 'none' || check.rule === 'exact' || check.rule === 'both') {
        matchedRule = check.rule;
      }
    }
  }

  // Pick closest valid sum if multiple exist at an exact boundary
  let impliedSum: number | null = null;
  if (validSums.length > 0) {
    impliedSum = validSums.reduce((best, s) =>
      Math.abs(s / nEff - reportedMean) < Math.abs(best / nEff - reportedMean) ? s : best
    );
  }

  const lattice = buildMeanLattice(centerS, nEff, reportedMean, decimals, windowLow, windowHigh);
  const consistent = validSums.length > 0;

  let reason: string;
  if (consistent && impliedSum !== null) {
    const exactMean = (impliedSum / nEff).toFixed(Math.max(4, decimals + 2));
    reason = `Consistent: integer sum S = ${impliedSum} yields ${exactMean}, rounding to ${trimmed} at ${decimals} decimal place${decimals === 1 ? '' : 's'}.`;
  } else {
    const below = lattice.filter((p) => p.mean < reportedMean).slice(-1)[0];
    const above = lattice.find((p) => p.mean > reportedMean);
    reason = `GRIM impossible: no integer sum S divided by N × k = ${nEff} rounds to ${trimmed} (nearest valid means: ${below?.formatted ?? '—'} and ${above?.formatted ?? '—'}).`;
  }

  return {
    applicable: true,
    consistent,
    reason,
    nEff,
    decimals,
    reportedMean,
    windowLow,
    windowHigh,
    impliedSum,
    validSums,
    matchedRoundingRule: matchedRule,
    nearestPossibleMeans: lattice,
  };
}

function buildMeanLattice(
  centerS: number,
  nEff: number,
  reportedMean: number,
  decimals: number,
  windowLow: number,
  windowHigh: number
): MeanLatticePoint[] {
  const points: MeanLatticePoint[] = [];
  for (let offset = -6; offset <= 6; offset++) {
    const sum = centerS + offset;
    const mean = sum / nEff;
    const check = checkRoundingMatch(mean, reportedMean, decimals);
    const isWithinWindow =
      mean >= windowLow - FLOAT_GUARD && mean <= windowHigh + FLOAT_GUARD;
    points.push({
      sum,
      mean,
      formatted: mean.toFixed(decimals),
      delta: mean - reportedMean,
      isWithinWindow,
      isMatch: check.matches,
    });
  }
  return points;
}

/**
 * Exact Generalized Allard (2018) Parity-Checked GRIMMER test.
 * Evaluates whether any integer distribution (with respondent scale sums y_i = k * x_i)
 * can produce both the reported Mean and the reported SD under sample (N-1) or population (N) formula.
 */
export function evaluateGrimmer(
  meanStr: string,
  sdStr: string,
  n: number,
  items: number = 1,
  formulaMode: SdFormulaMode = 'sample',
  precomputedGrim?: GrimResult
): GrimmerResult | null {
  const trimmedSd = sdStr.trim().replace(/[−–—]/g, '-');
  if (!trimmedSd) return null;

  const reportedSd = Number.parseFloat(trimmedSd);
  const sdDecimals = getDecimalPrecision(trimmedSd);
  const safeN = Math.floor(n);
  const safeItems = Math.max(1, Math.floor(items));
  const grim = precomputedGrim ?? evaluateGrim(meanStr, safeN, safeItems);

  const halfStep = 0.5 * Math.pow(10, -sdDecimals);
  const sdWindowLow = Math.max(0, reportedSd - halfStep);
  const sdWindowHigh = reportedSd + halfStep;

  if (!Number.isFinite(reportedSd) || reportedSd < 0 || safeN < 2) {
    return {
      applicable: false,
      consistent: false,
      reason: 'GRIMMER requires a non-negative SD and sample size N ≥ 2.',
      formulaMode,
      sdDecimals,
      reportedSd,
      sdWindowLow,
      sdWindowHigh,
      impliedSum: grim.impliedSum,
      sumParity: grim.impliedSum !== null ? parityOf(grim.impliedSum) : null,
      qMinDiscrete: null,
      qWindowLow: null,
      qWindowHigh: null,
      allIntegersInWindow: [],
      validParityCandidates: [],
      parityForbiddenInWindow: [],
      nearestPossibleSDs: [],
      matchedRoundingRule: 'none',
    };
  }

  if (!grim.applicable || !grim.consistent || grim.validSums.length === 0) {
    return {
      applicable: false,
      consistent: false,
      reason: !grim.applicable
        ? 'GRIMMER skipped: Mean granularity is unconstrained (N × k exceeds 10^d), so the integer sum S is not uniquely pinned.'
        : 'GRIMMER skipped: Mean already fails GRIM, so no valid integer sum S exists.',
      formulaMode,
      sdDecimals,
      reportedSd,
      sdWindowLow,
      sdWindowHigh,
      impliedSum: grim.impliedSum,
      sumParity: grim.impliedSum !== null ? parityOf(grim.impliedSum) : null,
      qMinDiscrete: null,
      qWindowLow: null,
      qWindowHigh: null,
      allIntegersInWindow: [],
      validParityCandidates: [],
      parityForbiddenInWindow: [],
      nearestPossibleSDs: [],
      matchedRoundingRule: 'none',
    };
  }

  const denom = formulaMode === 'sample' ? safeN - 1 : safeN;
  const scaleFactor = denom * safeItems * safeItems;

  const evalForSum = (sumS: number) => {
    const sSqOverN = (sumS * sumS) / safeN;
    const qMinDiscrete = discreteMinSumOfSquares(sumS, safeN);

    const qExactLow = scaleFactor * sdWindowLow * sdWindowLow + sSqOverN;
    const qExactHigh = scaleFactor * sdWindowHigh * sdWindowHigh + sSqOverN;
    const qExactCenter = scaleFactor * reportedSd * reportedSd + sSqOverN;

    const qSearchLo = Math.max(qMinDiscrete, Math.floor(qExactLow - FLOAT_GUARD) - 1);
    const qSearchHi = Math.max(qMinDiscrete, Math.ceil(qExactHigh + FLOAT_GUARD) + 1);

    const allIntegersInWindow: number[] = [];
    const validParityCandidates: number[] = [];
    const parityForbiddenInWindow: number[] = [];
    let matchedRule: GrimmerResult['matchedRoundingRule'] = 'none';

    const sdFromQ = (qVal: number): number => {
      const num = qVal - sSqOverN;
      if (num <= 0) return 0;
      return Math.sqrt(num / scaleFactor);
    };

    for (let q = qSearchLo; q <= qSearchHi; q++) {
      const candSd = sdFromQ(q);
      const roundCheck = checkRoundingMatch(candSd, reportedSd, sdDecimals);
      if (roundCheck.matches) {
        allIntegersInWindow.push(q);
        if (isAchievableIntegerQ(q, sumS, safeN)) {
          validParityCandidates.push(q);
          if (matchedRule === 'none' || roundCheck.rule === 'exact' || roundCheck.rule === 'both') {
            matchedRule = roundCheck.rule;
          }
        } else {
          parityForbiddenInWindow.push(q);
        }
      }
    }

    // Build surrounding Vernier lattice of BOTH parity-valid and parity-forbidden integer Qs
    const centerQ = Math.max(qMinDiscrete, Math.round(qExactCenter));
    const lattice: SdLatticePoint[] = [];
    const startQ = Math.max(qMinDiscrete, centerQ - 7);
    const endQ = Math.max(startQ + 14, centerQ + 7);

    for (let q = startQ; q <= endQ; q++) {
      const sd = sdFromQ(q);
      const parityValid = isAchievableIntegerQ(q, sumS, safeN);
      const check = checkRoundingMatch(sd, reportedSd, sdDecimals);
      const isWithinWindow =
        sd >= sdWindowLow - FLOAT_GUARD && sd <= sdWindowHigh + FLOAT_GUARD;
      lattice.push({
        q,
        parity: parityOf(q),
        parityValid,
        sd,
        formatted: sd.toFixed(sdDecimals),
        delta: sd - reportedSd,
        isWithinWindow,
        isMatch: parityValid && check.matches,
      });
    }

    return {
      sumS,
      qMinDiscrete,
      qExactLow,
      qExactHigh,
      allIntegersInWindow,
      validParityCandidates,
      parityForbiddenInWindow,
      lattice,
      matchedRule,
    };
  };

  // Evaluate across all GRIM-valid sums (usually 1 unique S, occasionally 2 at a midpoint tie)
  const candidates = grim.validSums.map(evalForSum);
  const passing = candidates.find((c) => c.validParityCandidates.length > 0);
  const chosen = passing ?? candidates[0];

  const sumParity = parityOf(chosen.sumS);
  const consistent = chosen.validParityCandidates.length > 0;

  let reason: string;
  if (consistent) {
    const q0 = chosen.validParityCandidates[0];
    const exactSd = Math.sqrt(
      Math.max(0, (q0 - (chosen.sumS * chosen.sumS) / safeN) / scaleFactor)
    );
    reason = `Consistent: Q = ${q0} (${parityOf(q0)} ≡ S = ${chosen.sumS} mod 2) yields SD = ${exactSd.toFixed(Math.max(4, sdDecimals + 2))}, rounding to ${trimmedSd}.`;
  } else if (chosen.parityForbiddenInWindow.length > 0) {
    const ghostQs = chosen.parityForbiddenInWindow.join(', ');
    const validNeighbors = chosen.lattice.filter((p) => p.parityValid);
    const below = validNeighbors.filter((p) => p.sd < reportedSd).slice(-1)[0];
    const above = validNeighbors.find((p) => p.sd > reportedSd);
    reason = `GRIMMER parity impossibility: integer Q = ${ghostQs} falls in the rounding window but has ${parityOf(chosen.parityForbiddenInWindow[0])} parity, violating Allard's invariant Q ≡ S (${sumParity}) mod 2. Nearest valid SDs: ${below?.formatted ?? '—'} / ${above?.formatted ?? '—'}.`;
  } else {
    const validNeighbors = chosen.lattice.filter((p) => p.parityValid);
    const below = validNeighbors.filter((p) => p.sd < reportedSd).slice(-1)[0];
    const above = validNeighbors.find((p) => p.sd > reportedSd);
    reason = `GRIMMER granularity impossibility: no parity-valid integer Q (${sumParity}) lands inside [${chosen.qExactLow.toFixed(2)}, ${chosen.qExactHigh.toFixed(2)}]. Nearest valid SDs: ${below?.formatted ?? '—'} / ${above?.formatted ?? '—'}.`;
  }

  return {
    applicable: true,
    consistent,
    reason,
    formulaMode,
    sdDecimals,
    reportedSd,
    sdWindowLow,
    sdWindowHigh,
    impliedSum: chosen.sumS,
    sumParity,
    qMinDiscrete: chosen.qMinDiscrete,
    qWindowLow: chosen.qExactLow,
    qWindowHigh: chosen.qExactHigh,
    allIntegersInWindow: chosen.allIntegersInWindow,
    validParityCandidates: chosen.validParityCandidates,
    parityForbiddenInWindow: chosen.parityForbiddenInWindow,
    nearestPossibleSDs: chosen.lattice,
    matchedRoundingRule: chosen.matchedRule,
  };
}

/**
 * Full unified GRIM + GRIMMER audit for a single table row.
 */
export function auditTableRow(
  input: TableRowInput,
  formulaMode: SdFormulaMode = 'sample'
): TableRowAudit {
  const grim = evaluateGrim(input.meanStr, input.n, input.items);
  const grimmer = evaluateGrimmer(
    input.meanStr,
    input.sdStr,
    input.n,
    input.items,
    formulaMode,
    grim
  );

  let status: TableRowAudit['status'];
  if (!grim.applicable) {
    status = 'INAPPLICABLE';
  } else if (!grim.consistent) {
    status = 'GRIM IMPOSSIBLE';
  } else if (grimmer && grimmer.applicable && !grimmer.consistent) {
    status = 'GRIMMER IMPOSSIBLE';
  } else {
    status = 'VERIFIED';
  }

  const proofSteps: string[] = [];
  const kLabel =
    input.items > 1 ? ` × ${input.items} items = ${grim.nEff}` : ` × 1 item = ${grim.nEff}`;
  proofSteps.push(
    `1. Effective integer denominator: N_eff = ${input.n}${kLabel} (reporting precision d_M = ${grim.decimals}, granularity ceiling 10^${grim.decimals} = ${Math.pow(10, grim.decimals)}).`
  );

  if (!grim.applicable) {
    proofSteps.push(`2. Granularity boundary exceeded: N_eff (${grim.nEff}) > 10^${grim.decimals}, so GRIM/GRIMMER cannot exclude any reported mean.`);
  } else if (!grim.consistent) {
    const below = grim.nearestPossibleMeans.filter((p) => p.mean < grim.reportedMean).slice(-1)[0];
    const above = grim.nearestPossibleMeans.find((p) => p.mean > grim.reportedMean);
    proofSteps.push(
      `2. GRIM acceptance window [${grim.windowLow.toFixed(grim.decimals + 1)}, ${grim.windowHigh.toFixed(grim.decimals + 1)}] maps to sum S ∈ [${(grim.windowLow * grim.nEff).toFixed(3)}, ${(grim.windowHigh * grim.nEff).toFixed(3)}], which contains zero integers.`
    );
    proofSteps.push(
      `3. Nearest achievable integer sums: S = ${below?.sum ?? '—'} (M = ${below?.formatted ?? '—'}) and S = ${above?.sum ?? '—'} (M = ${above?.formatted ?? '—'}).`
    );
  } else {
    proofSteps.push(
      `2. GRIM verified: implied integer sum S = ${grim.impliedSum} (exact mean = ${(grim.impliedSum! / grim.nEff).toFixed(4)} → rounds to ${input.meanStr}). Parity S mod 2 = ${parityOf(grim.impliedSum!)}.`
    );
    if (grimmer && grimmer.applicable && grimmer.qWindowLow !== null && grimmer.qWindowHigh !== null) {
      const denomExpr = formulaMode === 'sample' ? `(N − 1) = ${input.n - 1}` : `N = ${input.n}`;
      proofSteps.push(
        `3. Discrete Cauchy-Schwarz floor for N = ${input.n}, S = ${grimmer.impliedSum}: Q_min = ${grimmer.qMinDiscrete}. Under ${formulaMode} SD (${denomExpr}), SD ∈ [${grimmer.sdWindowLow.toFixed(grimmer.sdDecimals + 1)}, ${grimmer.sdWindowHigh.toFixed(grimmer.sdDecimals + 1)}] requires Q ∈ [${grimmer.qWindowLow.toFixed(2)}, ${grimmer.qWindowHigh.toFixed(2)}].`
      );
      if (grimmer.consistent) {
        proofSteps.push(
          `4. Allard parity invariant Q ≡ S (${grimmer.sumParity}) mod 2 satisfied by Q ∈ {${grimmer.validParityCandidates.join(', ')}}.`
        );
      } else if (grimmer.parityForbiddenInWindow.length > 0) {
        proofSteps.push(
          `4. Parity violation: Q = ${grimmer.parityForbiddenInWindow.join(', ')} sits inside the SD window, but is ${parityOf(grimmer.parityForbiddenInWindow[0])} whereas S = ${grimmer.impliedSum} is ${grimmer.sumParity}. No integer vector can satisfy Σy_i² ≡ Σy_i (mod 2).`
        );
      } else {
        proofSteps.push(
          `4. Granularity gap: zero parity-valid integers (${grimmer.sumParity}) exist in [${grimmer.qWindowLow.toFixed(2)}, ${grimmer.qWindowHigh.toFixed(2)}].`
        );
      }
    }
  }

  let executiveSummary: string;
  if (status === 'INAPPLICABLE') {
    executiveSummary = `Effective sample denominator N × k = ${grim.nEff} exceeds 10^${grim.decimals} — reporting precision is too coarse for GRIM/GRIMMER exclusion.`;
  } else if (status === 'GRIM IMPOSSIBLE') {
    const below = grim.nearestPossibleMeans.filter((p) => p.mean < grim.reportedMean).slice(-1)[0];
    const above = grim.nearestPossibleMeans.find((p) => p.mean > grim.reportedMean);
    executiveSummary = `Mean ${input.meanStr} is mathematically impossible for N = ${input.n}${input.items > 1 ? ` (k = ${input.items})` : ''} — nearest valid means are ${below?.formatted ?? '—'} (S = ${below?.sum ?? '—'}) and ${above?.formatted ?? '—'} (S = ${above?.sum ?? '—'}).`;
  } else if (status === 'GRIMMER IMPOSSIBLE' && grimmer) {
    const validNeighbors = grimmer.nearestPossibleSDs.filter((p) => p.parityValid);
    const below = validNeighbors.filter((p) => p.sd < grimmer.reportedSd).slice(-1)[0];
    const above = validNeighbors.find((p) => p.sd > grimmer.reportedSd);
    const parityClause =
      grimmer.parityForbiddenInWindow.length > 0
        ? ` (Q = ${grimmer.parityForbiddenInWindow[0]} fails Allard parity Q ≡ S mod 2)`
        : '';
    executiveSummary = `Mean ${input.meanStr} is consistent with integer sum S = ${grim.impliedSum}, but no integer distribution with N = ${input.n} and S = ${grim.impliedSum} can yield SD = ${input.sdStr}${parityClause} — nearest parity-valid SD is ${below?.formatted ?? '—'} or ${above?.formatted ?? '—'}.`;
  } else if (grimmer && grimmer.applicable && grimmer.validParityCandidates.length > 0) {
    executiveSummary = `Both Mean ${input.meanStr} (S = ${grim.impliedSum}) and SD ${input.sdStr} (Q = ${grimmer.validParityCandidates[0]}, ${grimmer.sumParity} parity) are mathematically consistent with integer-scored data.`;
  } else {
    executiveSummary = `Mean ${input.meanStr} is mathematically consistent with integer sum S = ${grim.impliedSum} (N_eff = ${grim.nEff}).`;
  }

  return {
    input,
    status,
    grim,
    grimmer,
    executiveSummary,
    proofSteps,
  };
}

/**
 * Parses pasted TSV, CSV, or whitespace-delimited table rows:
 * Supports: "Label, Mean, SD, N [, Items]" or "Mean, SD, N [, Items]".
 */
export function parseBatchTableText(rawText: string): TableRowInput[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const parsed: TableRowInput[] = [];
  let rowIndex = 1;

  for (const line of lines) {
    // Determine delimiter: tab > comma > semicolon > multi-space/whitespace
    let tokens: string[];
    if (line.includes('\t')) {
      tokens = line.split('\t').map((t) => t.trim());
    } else if (line.includes(',')) {
      tokens = line.split(',').map((t) => t.trim());
    } else if (line.includes(';')) {
      tokens = line.split(';').map((t) => t.trim());
    } else {
      tokens = line.split(/\s+/).map((t) => t.trim());
    }

    tokens = tokens.filter((t) => t.length > 0);
    if (tokens.length < 2) continue;

    // Skip obvious header lines (e.g. "Variable, Mean, SD, N")
    const numericCount = tokens.filter((t) => /^[+\-−–]?\d*(\.\d+)?$/.test(t) && /\d/.test(t)).length;
    if (numericCount < 2) continue;

    // Find the trailing numeric block (Mean, SD, N [, Items]) or (Mean, N)
    let firstNumIdx = tokens.length;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^[+\-−–]?\d*(\.\d+)?$/.test(tokens[i]) && /\d/.test(tokens[i])) {
        firstNumIdx = i;
      } else {
        break;
      }
    }

    const labelParts = tokens.slice(0, firstNumIdx);
    const numParts = tokens.slice(firstNumIdx);
    const label = labelParts.length > 0 ? labelParts.join(' ') : `Row ${rowIndex}`;

    let meanStr = '';
    let sdStr = '';
    let nVal = 0;
    let itemsVal = 1;

    if (numParts.length >= 4) {
      meanStr = numParts[0];
      sdStr = numParts[1];
      nVal = Math.round(Number.parseFloat(numParts[2]));
      itemsVal = Math.max(1, Math.round(Number.parseFloat(numParts[3])));
    } else if (numParts.length === 3) {
      meanStr = numParts[0];
      sdStr = numParts[1];
      nVal = Math.round(Number.parseFloat(numParts[2]));
    } else if (numParts.length === 2) {
      meanStr = numParts[0];
      sdStr = '';
      nVal = Math.round(Number.parseFloat(numParts[1]));
    } else {
      continue;
    }

    if (!Number.isFinite(nVal) || nVal < 1) continue;

    parsed.push({
      id: `pasted-${Date.now()}-${rowIndex}`,
      label,
      meanStr: meanStr.replace(/[−–—]/g, '-'),
      sdStr: sdStr.replace(/[−–—]/g, '-'),
      n: nVal,
      items: itemsVal,
    });
    rowIndex++;
  }

  return parsed;
}

/**
 * Generates a clean, reproducible Markdown forensic audit summary for the Table Impossibility Lab.
 */
export function formatTableAuditMarkdown(
  specimenTitle: string,
  sha256Short: string,
  formulaMode: SdFormulaMode,
  audits: TableRowAudit[]
): string {
  const verified = audits.filter((a) => a.status === 'VERIFIED').length;
  const impossible = audits.filter(
    (a) => a.status === 'GRIM IMPOSSIBLE' || a.status === 'GRIMMER IMPOSSIBLE'
  ).length;
  const inapplicable = audits.filter((a) => a.status === 'INAPPLICABLE').length;
  const timestamp = new Date().toISOString();

  const header = [
    `# LITMUS Forensic Table Audit Dossier`,
    ``,
    `- **Specimen:** ${specimenTitle}`,
    `- **SHA-256 Fingerprint:** \`${sha256Short}\``,
    `- **SD Denominator:** ${formulaMode === 'sample' ? 'Sample (N − 1)' : 'Population (N)'}`,
    `- **Timestamp (UTC):** ${timestamp}`,
    `- **Summary:** ${audits.length} rows audited · ${verified} VERIFIED · ${impossible} IMPOSSIBLE · ${inapplicable} INAPPLICABLE`,
    ``,
    `| Row | Mean | SD | N | Items (k) | Implied S | Verdict | Forensic Note |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |`,
  ];

  const rows = audits.map((a) => {
    const sVal = a.grim.impliedSum !== null ? String(a.grim.impliedSum) : '—';
    return `| ${a.input.label} | ${a.input.meanStr} | ${a.input.sdStr || '—'} | ${a.input.n} | ${a.input.items} | ${sVal} | **${a.status}** | ${a.executiveSummary} |`;
  });

  return [...header, ...rows, ``].join('\n');
}
