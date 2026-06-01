import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryWithBackoff,
  isSerializationError,
  computeDelay,
} from './retryWithBackoff';
import { ServiceUnavailableError } from './errors';

// Mock the sleep function so retries resolve instantly in tests
vi.mock('./retryWithBackoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./retryWithBackoff')>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

// ---------------------------------------------------------------------------
// Helper: create a mock PostgreSQL serialization error (SQLSTATE 40001)
// ---------------------------------------------------------------------------
function makeSerializationError(message = 'OCC conflict'): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = '40001';
  return err;
}

// ---------------------------------------------------------------------------
// isSerializationError
// ---------------------------------------------------------------------------
describe('isSerializationError', () => {
  it('returns true for an error with code "40001"', () => {
    expect(isSerializationError(makeSerializationError())).toBe(true);
  });

  it('returns false for a generic Error without a code', () => {
    expect(isSerializationError(new Error('boom'))).toBe(false);
  });

  it('returns false for a non-serialization pg error code', () => {
    const err = new Error('unique violation') as Error & { code: string };
    err.code = '23505';
    expect(isSerializationError(err)).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isSerializationError(null)).toBe(false);
    expect(isSerializationError(undefined)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isSerializationError('40001')).toBe(false);
    expect(isSerializationError(40001)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeDelay
// ---------------------------------------------------------------------------
describe('computeDelay', () => {
  it('returns a value between baseDelayMs * 2^attempt and that plus baseDelayMs', () => {
    const base = 50;
    const max = 2000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = computeDelay(attempt, base, max);
      const lower = base * Math.pow(2, attempt);
      expect(delay).toBeGreaterThanOrEqual(lower);
      expect(delay).toBeLessThanOrEqual(Math.min(lower + base, max));
    }
  });

  it('caps the delay at maxDelayMs', () => {
    const delay = computeDelay(20, 50, 2000);
    expect(delay).toBeLessThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------------
describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the result on first success without retrying', async () => {
    const op = vi.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(op);

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries on serialization error and succeeds', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(makeSerializationError())
      .mockResolvedValue('recovered');

    const result = await retryWithBackoff(op, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
    });

    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('throws ServiceUnavailableError after exhausting all retries', async () => {
    const op = vi.fn().mockRejectedValue(makeSerializationError());

    await expect(
      retryWithBackoff(op, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toThrow(ServiceUnavailableError);

    // 1 initial + 2 retries = 3 total calls
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('propagates non-serialization errors immediately without retrying', async () => {
    const nonOccError = new Error('connection refused');
    const op = vi.fn().mockRejectedValue(nonOccError);

    await expect(retryWithBackoff(op)).rejects.toThrow('connection refused');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('logs a warning for each OCC conflict', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(makeSerializationError())
      .mockRejectedValueOnce(makeSerializationError())
      .mockResolvedValue('done');

    await retryWithBackoff(op, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });

    expect(console.warn).toHaveBeenCalledTimes(2);
    expect((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('attempt 1');
    expect((console.warn as ReturnType<typeof vi.fn>).mock.calls[1][0]).toContain('attempt 2');
  });

  it('respects custom retry options', async () => {
    const op = vi.fn().mockRejectedValue(makeSerializationError());

    await expect(
      retryWithBackoff(op, { maxRetries: 1, baseDelayMs: 5, maxDelayMs: 50 }),
    ).rejects.toThrow(ServiceUnavailableError);

    // 1 initial + 1 retry = 2 total calls
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('retries the exact number of maxRetries times before failing', async () => {
    const op = vi.fn().mockRejectedValue(makeSerializationError());

    await expect(
      retryWithBackoff(op, { maxRetries: 4, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toThrow(ServiceUnavailableError);

    // 1 initial + 4 retries = 5 total calls
    expect(op).toHaveBeenCalledTimes(5);
  });

  it('succeeds on the last possible retry attempt', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(makeSerializationError())
      .mockRejectedValueOnce(makeSerializationError())
      .mockRejectedValueOnce(makeSerializationError())
      .mockResolvedValue('last-chance');

    const result = await retryWithBackoff(op, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
    });

    expect(result).toBe('last-chance');
    expect(op).toHaveBeenCalledTimes(4);
  });
});
