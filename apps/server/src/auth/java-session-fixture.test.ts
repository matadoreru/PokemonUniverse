import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Fixture inversa: token firmado por el backend Java (ExportJavaSessionFixture, exp 2099-01-01)
// con el mismo secreto que application-test.yml. Node debe aceptarlo tal cual.
// config.ts valida process.env al importarse, así que el entorno se fija antes del import dinámico.
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.DATABASE_URL ??= 'postgresql://x';

describe('sesión emitida por el backend Java', () => {
  it('se verifica en Node con la misma identidad', async () => {
    const { verifyIdentity } = await import('./tokens.js');
    const token = readFileSync(new URL('./fixtures/java-session-token.txt', import.meta.url), 'utf8').trim();

    await expect(verifyIdentity(token)).resolves.toEqual({
      id: 'user_fixture_java', displayName: 'Ana', kind: 'USER', role: 'USER', avatar: { type: 'DEFAULT' },
    });
  });
});
