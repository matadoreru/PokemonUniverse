import type { AuthUser } from '@pokemon-universe/shared';

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthUser }
}
