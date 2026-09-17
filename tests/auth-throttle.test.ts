import { describe, it, expect, beforeEach } from 'vitest';
import {
  THROTTLE, clearFailures, lockoutRemainingMs, recordFailure, __resetThrottle,
} from '@/lib/auth-throttle';

/**
 * bcrypt at cost 12 makes each guess expensive; it does not cap how many
 * guesses are allowed. These pin the cap.
 */
beforeEach(() => __resetThrottle());

describe('sign-in throttling', () => {
  it('lets a normal wrong password through without locking', () => {
    recordFailure('priya@northwind.in');
    recordFailure('priya@northwind.in');
    expect(lockoutRemainingMs('priya@northwind.in')).toBe(0);
  });

  it('locks the account once the attempt budget is spent', () => {
    for (let i = 0; i < THROTTLE.MAX_ATTEMPTS; i++) recordFailure('target@xcc.test');
    expect(lockoutRemainingMs('target@xcc.test')).toBeGreaterThan(0);
  });

  it('reports the wait in a usable range', () => {
    for (let i = 0; i < THROTTLE.MAX_ATTEMPTS; i++) recordFailure('target@xcc.test');
    const left = lockoutRemainingMs('target@xcc.test');
    expect(left).toBeLessThanOrEqual(THROTTLE.LOCKOUT_MS);
    expect(left).toBeGreaterThan(THROTTLE.LOCKOUT_MS - 5_000);
  });

  it('counts an address regardless of case or padding', () => {
    for (let i = 0; i < THROTTLE.MAX_ATTEMPTS; i++) recordFailure('  TARGET@xcc.test ');
    expect(lockoutRemainingMs('target@xcc.test')).toBeGreaterThan(0);
  });

  it('does not lock a different account', () => {
    for (let i = 0; i < THROTTLE.MAX_ATTEMPTS; i++) recordFailure('target@xcc.test');
    expect(lockoutRemainingMs('someone.else@xcc.test')).toBe(0);
  });

  it('forgets the failures once the password is right', () => {
    for (let i = 0; i < THROTTLE.MAX_ATTEMPTS - 1; i++) recordFailure('target@xcc.test');
    clearFailures('target@xcc.test');
    recordFailure('target@xcc.test');
    expect(lockoutRemainingMs('target@xcc.test')).toBe(0);
  });
});
