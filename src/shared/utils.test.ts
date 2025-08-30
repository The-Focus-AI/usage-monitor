import { describe, it, expect } from 'vitest';
import { formatUsd, getCurrentUtc, shouldSendDaily, createDayKey, safeParseFloat, safeParseInt } from './utils.js';

describe('formatUsd', () => {
  it('formats positive numbers correctly', () => {
    expect(formatUsd(10.5)).toBe('$10.50');
    expect(formatUsd(100)).toBe('$100.00');
    expect(formatUsd(0.99)).toBe('$0.99');
  });

  it('handles zero and negative numbers', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(-5.25)).toBe('$-5.25');
  });

  it('handles invalid numbers', () => {
    expect(formatUsd(NaN)).toBe('$0.00');
    expect(formatUsd(Infinity)).toBe('$0.00');
  });
});

describe('getCurrentUtc', () => {
  it('returns current UTC time components', () => {
    const result = getCurrentUtc();
    
    expect(result.now).toBeInstanceOf(Date);
    expect(typeof result.year).toBe('number');
    expect(typeof result.month).toBe('number');
    expect(typeof result.day).toBe('number');
    expect(typeof result.hour).toBe('number');
    expect(typeof result.minute).toBe('number');
    
    expect(result.month).toBeGreaterThanOrEqual(0);
    expect(result.month).toBeLessThanOrEqual(11);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });
});

describe('shouldSendDaily', () => {
  it('returns true when hours match', () => {
    expect(shouldSendDaily(16, 16)).toBe(true);
    expect(shouldSendDaily(0, 0)).toBe(true);
    expect(shouldSendDaily(23, 23)).toBe(true);
  });

  it('returns false when hours do not match', () => {
    expect(shouldSendDaily(16, 17)).toBe(false);
    expect(shouldSendDaily(0, 23)).toBe(false);
    expect(shouldSendDaily(12, 13)).toBe(false);
  });
});

describe('createDayKey', () => {
  it('creates day key with default prefix', () => {
    const key = createDayKey();
    expect(key).toMatch(/^daily:\d{4}-\d{2}-\d{2}$/);
  });

  it('creates day key with custom prefix', () => {
    const key = createDayKey('test');
    expect(key).toMatch(/^test:\d{4}-\d{2}-\d{2}$/);
  });
});

describe('safeParseFloat', () => {
  it('parses valid float strings', () => {
    expect(safeParseFloat('10.5', 0)).toBe(10.5);
    expect(safeParseFloat('0', 5)).toBe(0);
    expect(safeParseFloat('-3.14', 0)).toBe(-3.14);
  });

  it('returns default for invalid values', () => {
    expect(safeParseFloat('invalid', 42)).toBe(42);
    expect(safeParseFloat('', 10)).toBe(10);
    expect(safeParseFloat(undefined, 5)).toBe(5);
  });
});

describe('safeParseInt', () => {
  it('parses valid integer strings', () => {
    expect(safeParseInt('10', 0)).toBe(10);
    expect(safeParseInt('0', 5)).toBe(0);
    expect(safeParseInt('-3', 0)).toBe(-3);
  });

  it('returns default for invalid values', () => {
    expect(safeParseInt('invalid', 42)).toBe(42);
    expect(safeParseInt('', 10)).toBe(10);
    expect(safeParseInt(undefined, 5)).toBe(5);
  });
});