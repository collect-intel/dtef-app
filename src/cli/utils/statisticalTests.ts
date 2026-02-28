/**
 * Statistical Tests for Experiment Analysis
 *
 * Welch's t-test and Cohen's d for comparing two independent samples.
 * No external dependencies — implements the math directly.
 */

/** Compute mean of an array */
function mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Compute sample variance (Bessel's correction) */
function variance(arr: number[]): number {
    const m = mean(arr);
    return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
}

/** Compute sample standard deviation */
export function stddev(arr: number[]): number {
    return Math.sqrt(variance(arr));
}

/**
 * Approximate p-value from t-statistic using normal distribution.
 * Good approximation for df > 30 (we always have 49+ segments).
 * Two-tailed test.
 */
function pValueFromT(t: number, _df: number): number {
    // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
    const absT = Math.abs(t);
    const p = 0.2316419;
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const x = 1 / (1 + p * absT);
    const phi = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absT * absT);
    const cdf = 1 - phi * (b1 * x + b2 * x ** 2 + b3 * x ** 3 + b4 * x ** 4 + b5 * x ** 5);
    return 2 * (1 - cdf); // two-tailed
}

/**
 * Welch's t-test for two independent samples with unequal variances.
 * Returns t-statistic, degrees of freedom, and two-tailed p-value.
 */
export function welchTTest(a: number[], b: number[]): { t: number; df: number; pValue: number } {
    if (a.length < 2 || b.length < 2) {
        return { t: 0, df: 0, pValue: 1 };
    }

    const meanA = mean(a);
    const meanB = mean(b);
    const varA = variance(a);
    const varB = variance(b);
    const nA = a.length;
    const nB = b.length;

    const seA = varA / nA;
    const seB = varB / nB;
    const seDiff = Math.sqrt(seA + seB);

    if (seDiff === 0) {
        return { t: 0, df: nA + nB - 2, pValue: 1 };
    }

    const t = (meanA - meanB) / seDiff;

    // Welch-Satterthwaite degrees of freedom
    const df = (seA + seB) ** 2 / ((seA ** 2) / (nA - 1) + (seB ** 2) / (nB - 1));

    const pValue = pValueFromT(t, df);

    return { t, df, pValue };
}

/**
 * Cohen's d effect size for two independent samples.
 * Uses pooled standard deviation.
 */
export function cohensD(a: number[], b: number[]): number {
    if (a.length < 2 || b.length < 2) return 0;

    const meanA = mean(a);
    const meanB = mean(b);
    const varA = variance(a);
    const varB = variance(b);

    // Pooled standard deviation
    const pooledVar = ((a.length - 1) * varA + (b.length - 1) * varB) / (a.length + b.length - 2);
    const pooledSD = Math.sqrt(pooledVar);

    if (pooledSD === 0) return 0;

    return (meanA - meanB) / pooledSD;
}

/** Interpret Cohen's d magnitude */
export function interpretEffectSize(d: number): string {
    const absD = Math.abs(d);
    if (absD < 0.2) return 'negligible';
    if (absD < 0.5) return 'small';
    if (absD < 0.8) return 'medium';
    return 'large';
}
