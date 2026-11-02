import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AuthUser, ChangelogEntry, CustomCategoryView, FeedbackItem } from '@pokemon-universe/shared/public';
import type { components, paths } from './api-types';
import type { ChangelogResponse, FeedbackCreateResponse, MeResponse } from './api-contract';

const ROUTES = [
  '/api/auth/avatars/{filename}', '/api/auth/guest', '/api/auth/login', '/api/auth/logout', '/api/auth/me',
  '/api/auth/profile', '/api/auth/register', '/api/categories', '/api/categories/{id}', '/api/changelog',
  '/api/feedback', '/api/games', '/api/health', '/api/pokemon',
  '/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/audio',
  '/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/sprite',
] as const satisfies readonly (keyof paths)[];

describe('contrato OpenAPI generado', () => {
  it('expone exactamente las 16 rutas del backend Java', () => {
    expectTypeOf<keyof paths>().toEqualTypeOf<typeof ROUTES[number]>();
    expect(ROUTES).toHaveLength(16);
  });
  it('el usuario compartido es asignable al contrato generado', () => {
    expectTypeOf<AuthUser>().toMatchTypeOf<NonNullable<MeResponse['user']>>();
  });
  it('changelog y feedback usan los tipos de shared, validados contra el contrato generado', () => {
    expectTypeOf<ChangelogResponse['entries'][number]>().toEqualTypeOf<ChangelogEntry>();
    expectTypeOf<FeedbackCreateResponse['feedback']>().toEqualTypeOf<FeedbackItem>();
  });
  it('la vista de categoría personalizada coincide con la de shared', () => {
    expectTypeOf<components['schemas']['CustomCategoryView']>().toEqualTypeOf<CustomCategoryView>();
  });
});
