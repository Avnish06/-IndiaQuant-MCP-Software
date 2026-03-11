import { BlackScholes } from './blackScholes.js';

describe('BlackScholes', () => {
  // Known values from an online calculator:
  // S=100, K=100, T=1, r=0.05, sigma=0.2
  // Call: Delta=0.6368, Gamma=0.0188, Vega=0.3752, Theta=-6.4140 / 365 = -0.0176
  // Put: Delta=-0.3632, Gamma=0.0188, Vega=0.3752, Theta=-1.6579 / 365 = -0.0045
  
  const S = 100;
  const K = 100;
  const T = 1;
  const r = 0.05;
  const sigma = 0.2;

  test('calculateGreeks - call option', () => {
    const greeks = BlackScholes.calculateGreeks(S, K, T, r, sigma, 'call');
    
    expect(greeks.delta).toBeCloseTo(0.6368, 4);
    expect(greeks.gamma).toBeCloseTo(0.0188, 4);
    expect(greeks.vega).toBeCloseTo(0.3752, 4);
    expect(greeks.theta).toBeCloseTo(-0.0176, 4);
  });

  test('calculateGreeks - put option', () => {
    const greeks = BlackScholes.calculateGreeks(S, K, T, r, sigma, 'put');
    
    expect(greeks.delta).toBeCloseTo(-0.3632, 4);
    expect(greeks.gamma).toBeCloseTo(0.0188, 4);
    expect(greeks.vega).toBeCloseTo(0.3752, 4);
    expect(greeks.theta).toBeCloseTo(-0.0045, 4);
  });

  test('calculateGreeks - handles T=0 exactly', () => {
    const callGreeks = BlackScholes.calculateGreeks(105, 100, 0, 0.05, 0.2, 'call');
    expect(callGreeks.delta).toBe(1);
    expect(callGreeks.gamma).toBe(0);
    
    const putGreeks = BlackScholes.calculateGreeks(95, 100, 0, 0.05, 0.2, 'put');
    expect(putGreeks.delta).toBe(-1);
    expect(putGreeks.theta).toBe(0);

    const atmCall = BlackScholes.calculateGreeks(100, 100, 0, 0.05, 0.2, 'call');
    expect(atmCall.delta).toBe(0.5);
  });

  test('calculateGreeks - handles S=0', () => {
    const callGreeks = BlackScholes.calculateGreeks(0, 100, 1, 0.05, 0.2, 'call');
    expect(callGreeks.delta).toBe(0);
    expect(callGreeks.gamma).toBe(0);

    const putGreeks = BlackScholes.calculateGreeks(0, 100, 1, 0.05, 0.2, 'put');
    expect(putGreeks.delta).toBe(-1);
  });

  test('calculateGreeks - handles sigma=0', () => {
    // S=100, K=100, T=1, r=0.05, sigma=0
    // Call value = max(0, 100 - 100*exp(-0.05)) = max(0, 100 - 95.12) = 4.88
    // It's strictly ITM since S > K*exp(-rT)
    const callGreeks = BlackScholes.calculateGreeks(100, 100, 1, 0.05, 0, 'call');
    expect(callGreeks.delta).toBe(1);
    expect(callGreeks.gamma).toBe(0);

    const putGreeks = BlackScholes.calculateGreeks(100, 100, 1, 0.05, 0, 'put');
    expect(putGreeks.delta).toBe(0); // OTM
  });

  test('calculateGreeks - throws on negative inputs', () => {
    expect(() => BlackScholes.calculateGreeks(-1, 100, 1, 0.05, 0.2, 'call')).toThrow();
    expect(() => BlackScholes.calculateGreeks(100, 100, -1, 0.05, 0.2, 'call')).toThrow();
    expect(() => BlackScholes.calculateGreeks(100, 100, 1, 0.05, -0.2, 'call')).toThrow();
  });
});
