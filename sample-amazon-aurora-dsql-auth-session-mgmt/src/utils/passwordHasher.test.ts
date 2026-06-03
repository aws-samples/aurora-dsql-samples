import { describe, it, expect } from 'vitest';
import { hash, verify } from './passwordHasher';

describe('passwordHasher', () => {
  describe('hash', () => {
    it('should produce a valid bcrypt hash string', async () => {
      const result = await hash('mypassword');

      // bcrypt hashes start with $2a$ or $2b$ and are 60 characters long
      expect(result).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    });

    it('should use a cost factor of 10', async () => {
      const result = await hash('testpassword');

      // The cost factor is encoded in the hash: $2a$10$...
      expect(result).toMatch(/^\$2[ab]\$10\$/);
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'samepassword';
      const hash1 = await hash(password);
      const hash2 = await hash(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify', () => {
    it('should return true for a matching password', async () => {
      const password = 'correctpassword';
      const hashed = await hash(password);

      const result = await verify(password, hashed);

      expect(result).toBe(true);
    });

    it('should return false for a non-matching password', async () => {
      const hashed = await hash('originalpassword');

      const result = await verify('wrongpassword', hashed);

      expect(result).toBe(false);
    });

    it('should handle passwords at minimum length (8 chars)', async () => {
      const password = 'abcdefgh';
      const hashed = await hash(password);

      expect(await verify(password, hashed)).toBe(true);
    });

    it('should handle passwords at maximum length (128 chars)', async () => {
      const password = 'a'.repeat(128);
      const hashed = await hash(password);

      expect(await verify(password, hashed)).toBe(true);
    });
  });
});
