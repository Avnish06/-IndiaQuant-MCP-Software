/**
 * Black-Scholes Greeks implementation from scratch.
 * math from: https://en.wikipedia.org/wiki/Greeks_(finance)
 */

export class BlackScholes {
  /**
   * Cumulative Normal Distribution Function (N(x))
   * Approximation using the error function (erf)
   */
  private static cNDF(x: number): number {
    return (1.0 + this.erf(x / Math.sqrt(2.0))) / 2.0;
  }

  /**
   * Probability Density Function (N'(x))
   */
  private static nPrime(x: number): number {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
  }

  /**
   * Error function approximation
   */
  private static erf(x: number): number {
    // save the sign of x
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    // constants
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    // A&S formula 7.1.26
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Calculate Black-Scholes Greeks
   * @param S Current stock price
   * @param K Strike price
   * @param T Time to expiration (in years)
   * @param r Risk-free interest rate (e.g., 0.05 for 5%)
   * @param sigma Volatility (standard deviation of returns, e.g., 0.2 for 20%)
   * @param type 'call' or 'put'
   */
  public static calculateGreeks(
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number,
    type: 'call' | 'put'
  ) {
    if (T <= 0) T = 0.00001; // Avoid division by zero

    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const nD1 = this.cNDF(d1);
    const nD2 = this.cNDF(d2);
    const nPrimeD1 = this.nPrime(d1);

    const delta = type === 'call' ? nD1 : nD1 - 1;
    const gamma = nPrimeD1 / (S * sigma * Math.sqrt(T));
    const vega = (S * nPrimeD1 * Math.sqrt(T)) / 100; // Divided by 100 to show change for 1% vol change

    let theta: number;
    if (type === 'call') {
      theta =
        (- (S * nPrimeD1 * sigma) / (2 * Math.sqrt(T)) -
          r * K * Math.exp(-r * T) * nD2) / 365; // Per day
    } else {
      const nNegD1 = this.cNDF(-d1);
      const nNegD2 = this.cNDF(-d2);
      theta =
        (- (S * nPrimeD1 * sigma) / (2 * Math.sqrt(T)) +
          r * K * Math.exp(-r * T) * nNegD2) / 365; // Per day
    }

    return {
      delta: parseFloat(delta.toFixed(4)),
      gamma: parseFloat(gamma.toFixed(4)),
      vega: parseFloat(vega.toFixed(4)),
      theta: parseFloat(theta.toFixed(4)),
    };
  }
}
