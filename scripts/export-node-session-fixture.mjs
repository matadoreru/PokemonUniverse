// Genera el token de sesión que Node emitiría (jose, HS256) para el test de compatibilidad del backend Java.
// Uso: node scripts/export-node-session-fixture.mjs
import { writeFileSync } from 'node:fs';
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode('test-secret-test-secret-test-secret-1234');
const token = await new SignJWT({
  displayName: 'Ana',
  kind: 'USER',
  role: 'ADMIN',
  email: 'ana@example.com',
  avatar: { type: 'PRESET', value: 'trainer-aqua' }
})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('user_fixture')
  .setIssuedAt()
  .setExpirationTime(Math.floor(Date.UTC(2099, 0, 1) / 1000))
  .sign(secret);

const out = new URL('../backend/src/test/resources/fixtures/node-session-token.txt', import.meta.url);
writeFileSync(out, `${token}\n`);
console.log(`escrito ${out.pathname}`);
