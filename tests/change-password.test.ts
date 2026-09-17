import { describe, it, expect } from 'vitest';
import { changePasswordSchema } from '@/lib/validators';

/**
 * Every account in this app is created with a password an administrator chose
 * and still knows — there is no invitation email. Until someone changes it,
 * "one account per person" is a filing convention rather than an access
 * control, because the audit log names a person who never held their own
 * credentials alone. These pin the rules on the form that fixes that.
 */
const good = {
  currentPassword: 'the-one-they-gave-me',
  newPassword: 'harbour-lantern-copper',
  confirmPassword: 'harbour-lantern-copper',
};

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';

const firstError = (input: Record<string, unknown>, field: Field) => {
  const result = changePasswordSchema.safeParse(input);
  return result.success ? null : (result.error.flatten().fieldErrors[field]?.[0] ?? null);
};

describe('changing your own password', () => {
  it('accepts a current password and a matching new pair', () => {
    expect(changePasswordSchema.safeParse(good).success).toBe(true);
  });

  /**
   * Not ceremony: a signed-in browser left unattended is otherwise one form
   * submission away from locking its owner out.
   */
  it('requires the current password', () => {
    expect(firstError({ ...good, currentPassword: '' }, 'currentPassword'))
      .toBe('Enter your current password');
  });

  it('holds the new password to 12 characters', () => {
    expect(firstError({ ...good, newPassword: 'a'.repeat(11), confirmPassword: 'a'.repeat(11) }, 'newPassword'))
      .toBe('At least 12 characters');

    const twelve = 'a'.repeat(12);
    expect(changePasswordSchema.safeParse({ ...good, newPassword: twelve, confirmPassword: twelve }).success)
      .toBe(true);
  });

  it('catches a typo in the confirmation rather than saving it', () => {
    expect(firstError({ ...good, confirmPassword: 'harbour-lantern-coppar' }, 'confirmPassword'))
      .toBe('These do not match');
  });

  it('refuses a change that changes nothing', () => {
    const same = 'the-one-they-gave-me';
    expect(firstError({ currentPassword: same, newPassword: same, confirmPassword: same }, 'newPassword'))
      .toBe('That is the password you already have');
  });

  it('reports the length problem before the match problem', () => {
    // A short password that also fails to match should say what to fix first.
    const result = changePasswordSchema.safeParse({
      currentPassword: 'x', newPassword: 'short', confirmPassword: 'different',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.newPassword?.[0]).toBe('At least 12 characters');
    }
  });
});
