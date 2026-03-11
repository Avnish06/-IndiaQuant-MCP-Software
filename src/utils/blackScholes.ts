/**
 * Pure mathematical implementation of the Black-Scholes option pricing model and its Greeks.
 * Implemented from scratch as per assignment requirements (no external financial libraries used).
 */
export class BlackScholes {

  /**
   * Cumulative Normal Distribution Function (CNDF).
   * @param x Z-score
   * @returns Probability value [0, 1]
   */
  private static cNDF(x: number): number {
    return (1.0 + this.erf(x / Math.sqrt(2.0))) / 2.0;
  }

  /**
   * Probability Density Function (PDF) of the Normal Distribution.
   * @param x Z-score
   * @returns Density value
   */
  private static nPrime(x: number): number {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
  }

  /**
   * Numerical approximation of the Error Function (ERF).
   * @param x Input value
   * @returns ERF result
   */
  private static erf(x: number): number {
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Calculate Black-Scholes Greeks (Delta, Gamma, Vega, Theta).
   * @param S Current stock price ($)
   * @param K Strike price ($)
   * @param T Time to expiration (in years)
   * @param r Risk-free interest rate (e.g., 0.07 for 7%)
   * @param sigma Volatility (decimal, e.g., 0.20 for 20%)
   * @param type 'call' or 'put'
   * @returns An object containing the calculated Greeks
   */
  public static calculateGreeks(
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number,
    type: 'call' | 'put'
  ) {
    if (S < 0 || K < 0 || T < 0 || sigma < 0) {
      throw new Error('Inputs (S, K, T, sigma) must be non-negative');
    }

    // T = 0 edge case: Only intrinsic value remains
    if (T === 0) {
      let delta: number;
      if (type === 'call') {
        delta = S > K ? 1 : S === K ? 0.5 : 0;
      } else {
        delta = S < K ? -1 : S === K ? -0.5 : 0;
      }
      return { delta, gamma: 0, vega: 0, theta: 0 };
    }

    if (S === 0) {
      return { delta: type === 'call' ? 0 : -1, gamma: 0, vega: 0, theta: 0 };
    }

    if (sigma === 0) {
      const discountFactor = Math.exp(-r * T);
      const isITM = type === 'call' ? (S > K * discountFactor) : (S < K * discountFactor);
      return { delta: isITM ? (type === 'call' ? 1 : -1) : 0, gamma: 0, vega: 0, theta: 0 };
    }

    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const nD1 = this.cNDF(d1);
    const nD2 = this.cNDF(d2);
    const nPrimeD1 = this.nPrime(d1);

    const delta = type === 'call' ? nD1 : nD1 - 1;
    const gamma = nPrimeD1 / (S * sigma * Math.sqrt(T));
    
    // Vega: sensitivity to a 1% change in volatility
    const vega = (S * nPrimeD1 * Math.sqrt(T)) / 100;

    let theta: number;
    if (type === 'call') {
      theta = (- (S * nPrimeD1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * nD2) / 365;
    } else {
      const nNegD2 = this.cNDF(-d2);
      theta = (- (S * nPrimeD1 * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * nNegD2) / 365;
    }

    return {
      delta: parseFloat(delta.toFixed(4)),
      gamma: parseFloat(gamma.toFixed(4)),
      vega: parseFloat(vega.toFixed(4)),
      theta: parseFloat(theta.toFixed(4)),
    };
  }
}
