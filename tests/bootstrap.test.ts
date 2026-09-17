import { describe, it, expect } from 'vitest';
import { validateFirstAdmin, MIN_PASSWORD_LENGTH } from '../scripts/bootstrap';

/**
 * The bootstrap account is a Super admin on an empty database — it can read
 * every contract and reveal every stored credential, and it is created from a
 * terminal with no second pair of eyes. The rules are what stands in for
 * review, so they are checked here rather than trusted.
 */
const good = {
  name: 'Binoli Shah',
  email: 'binoli@zootechx.com',
  password: 'correct-horse-battery',
};

describe('first administrator', () => {
  it('accepts a real name, address and passphrase', () => {
    expect(validateFirstAdmin(good)).toEqual([]);
  });

  it(`refuses a password under ${MIN_PASSWORD_LENGTH} characters`, () => {
    const problems = validateFirstAdmin({ ...good, password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('reveal every stored credential');
    expect(validateFirstAdmin({ ...good, password: 'a'.repeat(MIN_PASSWORD_LENGTH) })).toEqual([]);
  });

  it('refuses the seeded demo password by name', () => {
    expect(validateFirstAdmin({ ...good, password: 'password123' }).join(' '))
      .toContain('seeded demo password');
  });

  it('refuses an address that cannot be signed in with', () => {
    for (const email of ['', 'nope', 'no@domain', 'two@@at.com', 'spaces in@it.com']) {
      expect(validateFirstAdmin({ ...good, email }), email).not.toEqual([]);
    }
  });

  it('refuses a placeholder name, because it is printed on proposals', () => {
    expect(validateFirstAdmin({ ...good, name: 'X' })).not.toEqual([]);
    expect(validateFirstAdmin({ ...good, name: '   ' })).not.toEqual([]);
  });

  it('reports every problem at once, not one per attempt', () => {
    expect(validateFirstAdmin({ name: '', email: 'bad', password: 'short' })).toHaveLength(3);
  });
});
