import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AuthUser, ChangelogEntry, CustomCategoryView, CustomWouldYouRatherPromptView, FeedbackItem } from '@pokemon-universe/shared/public';
import type { components, paths } from './api-types';
import type { ChangelogResponse, FeedbackCreateResponse, MeResponse } from './api-contract';

const ROUTES = [
  '/api/auth/avatars/{filename}', '/api/auth/guest', '/api/auth/login', '/api/auth/logout', '/api/auth/me',
  '/api/auth/profile', '/api/auth/register', '/api/categories', '/api/categories/{id}', '/api/changelog',
  '/api/feedback', '/api/games', '/api/health', '/api/pokemon',
  '/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/audio',
  '/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/sprite',
  '/api/would-you-rather-prompts', '/api/would-you-rather-prompts/import', '/api/would-you-rather-prompts/{id}',
] as const satisfies readonly (keyof paths)[];

describe('contrato OpenAPI generado', () => {
  it('expone exactamente las 19 rutas del backend Java', () => {
    expectTypeOf<keyof paths>().toEqualTypeOf<typeof ROUTES[number]>();
    expect(ROUTES).toHaveLength(19);
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
  it('los 400 con incidencias de Zod se documentan con ValidationErrorResponse', () => {
    expectTypeOf<components['schemas']['ZodIssue']['path']>().toEqualTypeOf<(string | number)[]>();
    expectTypeOf<paths['/api/categories']['post']['responses'][400]['content']['application/json']>()
      .toEqualTypeOf<components['schemas']['ValidationErrorResponse']>();
  });
  it('la vista de dilema personal coincide con la de shared', () => {
    expectTypeOf<components['schemas']['WouldYouRatherPromptView']>().toEqualTypeOf<CustomWouldYouRatherPromptView>();
  });
  it('los 400 de dilemas pueden traer incidencias de Zod o solo el error del servicio', () => {
    type Error400 = components['schemas']['ValidationErrorResponse'] | components['schemas']['ApiError'];
    expectTypeOf<paths['/api/would-you-rather-prompts']['post']['responses'][400]['content']['application/json']>()
      .toEqualTypeOf<Error400>();
    expectTypeOf<paths['/api/would-you-rather-prompts/{id}']['patch']['responses'][400]['content']['application/json']>()
      .toEqualTypeOf<Error400>();
    expectTypeOf<paths['/api/would-you-rather-prompts/import']['post']['responses'][400]['content']['application/json']>()
      .toEqualTypeOf<components['schemas']['ValidationErrorResponse']>();
  });
});
