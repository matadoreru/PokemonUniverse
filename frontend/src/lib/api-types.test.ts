import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AchievementFamily, AdminActiveRoom, AdminDataSyncItem, AdminGameHistoryItem, AdminRoomHistoryItem, AdminSummary, AdminUserItem, AuthUser, ChangelogEntry, CustomCategoryView, CustomWouldYouRatherPromptView, DailyStatus, FeedbackItem, LevelProgress, MiniGameManifest, TcgFilterOptions, UserProfileResponse } from '@pokemon-universe/shared/public';
import type { components, paths } from './api-types';
import type { ChangelogResponse, DailyLeaderboardResponse, DailyOverviewResponse, FeedbackCreateResponse, MeResponse } from './api-contract';

const ROUTES = [
  '/api/admin/active-rooms', '/api/admin/changelog', '/api/admin/changelog/{id}', '/api/admin/data-sync',
  '/api/admin/data-sync/{source}', '/api/admin/feedback', '/api/admin/feedback/{id}/status', '/api/admin/games',
  '/api/admin/rooms', '/api/admin/summary', '/api/admin/users',
  '/api/auth/avatars/{filename}', '/api/auth/guest', '/api/auth/guest/custom-avatar', '/api/auth/login',
  '/api/auth/logout', '/api/auth/me', '/api/auth/profile', '/api/auth/profile/avatar', '/api/auth/profile/avatar/custom',
  '/api/auth/password/forgot', '/api/auth/password/reset', '/api/auth/progress',
  '/api/auth/register', '/api/categories', '/api/categories/{id}', '/api/changelog', '/api/daily', '/api/daily/leaderboard',
  '/api/achievements', '/api/feedback', '/api/friends', '/api/friends/requests', '/api/friends/requests/{id}',
  '/api/friends/requests/{id}/accept', '/api/friends/{userId}', '/api/games', '/api/health', '/api/pokemon/selector', '/api/pokemon/{id}/sprite',
  '/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/audio',
  '/api/rooms/{code}/games/{assetToken}/rounds/{roundNumber}/options/{optionId}/sprite',
  '/api/tcg/eligibility', '/api/tcg/options', '/api/users/{username}/profile',
  '/api/would-you-rather-prompts', '/api/would-you-rather-prompts/import', '/api/would-you-rather-prompts/{id}',
] as const satisfies readonly (keyof paths)[];

describe('contrato OpenAPI generado', () => {
  it('expone exactamente las 48 rutas del backend Java', () => {
    expectTypeOf<keyof paths>().toEqualTypeOf<typeof ROUTES[number]>();
    expect(ROUTES).toHaveLength(48);
  });
  it('las opciones TCG coinciden con las de shared y la elegibilidad valida con incidencias de Zod', () => {
    expectTypeOf<paths['/api/tcg/options']['get']['responses'][200]['content']['application/json']>().toEqualTypeOf<TcgFilterOptions>();
    expectTypeOf<paths['/api/tcg/eligibility']['post']['responses'][200]['content']['application/json']>().toEqualTypeOf<{ cardCount: number }>();
    expectTypeOf<paths['/api/tcg/eligibility']['post']['responses'][400]['content']['application/json']>()
      .toEqualTypeOf<components['schemas']['ValidationErrorResponse']>();
  });
  it('las escrituras de avatar devuelven el usuario', () => {
    type UserResponse = paths['/api/auth/me']['get']['responses'][200]['content']['application/json'];
    expectTypeOf<paths['/api/auth/guest/custom-avatar']['post']['responses'][201]['content']['application/json']>().toEqualTypeOf<UserResponse>();
    expectTypeOf<paths['/api/auth/profile/avatar/custom']['put']['responses'][200]['content']['application/json']>().toEqualTypeOf<UserResponse>();
    expectTypeOf<paths['/api/auth/profile/avatar']['delete']['responses'][200]['content']['application/json']>().toEqualTypeOf<UserResponse>();
    expectTypeOf<paths['/api/auth/profile/avatar/custom']['put']['requestBody']['content']['image/png']>().toEqualTypeOf<string>();
  });
  it('el usuario compartido es asignable al contrato generado', () => {
    expectTypeOf<AuthUser>().toMatchTypeOf<NonNullable<MeResponse['user']>>();
  });
  it('el contrato generado es asignable a los tipos de shared (enumerados y opcionales sin null)', () => {
    type Body<P extends keyof paths, M extends keyof paths[P], S extends number> =
      paths[P][M] extends { responses: Record<S, { content: { 'application/json': infer B } }> } ? B : never;
    expectTypeOf<NonNullable<MeResponse['user']>>().toEqualTypeOf<AuthUser>();
    expectTypeOf<NonNullable<Body<'/api/auth/me', 'get', 200>['user']>>().toMatchTypeOf<AuthUser>();
    expectTypeOf<Body<'/api/auth/progress', 'get', 200>['progress']>().toMatchTypeOf<LevelProgress>();
    expectTypeOf<Body<'/api/changelog', 'get', 200>['entries'][number]>().toMatchTypeOf<ChangelogEntry>();
    expectTypeOf<Body<'/api/feedback', 'post', 201>['feedback']>().toMatchTypeOf<FeedbackItem>();
    expectTypeOf<Body<'/api/auth/profile', 'get', 200>['profile']>().toMatchTypeOf<UserProfileResponse>();
    expectTypeOf<Body<'/api/games', 'get', 200>['games'][number]>().toMatchTypeOf<MiniGameManifest>();
    expectTypeOf<Body<'/api/admin/active-rooms', 'get', 200>['items'][number]>().toMatchTypeOf<AdminActiveRoom>();
    expectTypeOf<Body<'/api/admin/rooms', 'get', 200>['items'][number]>().toMatchTypeOf<AdminRoomHistoryItem>();
    expectTypeOf<Body<'/api/admin/games', 'get', 200>['items'][number]>().toMatchTypeOf<AdminGameHistoryItem>();
    expectTypeOf<Body<'/api/admin/users', 'get', 200>['items'][number]>().toMatchTypeOf<AdminUserItem>();
    expectTypeOf<Body<'/api/admin/data-sync', 'get', 200>['sources'][number]>().toMatchTypeOf<AdminDataSyncItem>();
    expectTypeOf<Body<'/api/achievements', 'get', 200>['achievements'][number]['family']>().toEqualTypeOf<AchievementFamily>();
    expectTypeOf<DailyOverviewResponse['status']>().toEqualTypeOf<DailyStatus>();
    expectTypeOf<DailyLeaderboardResponse['me']['status']>().toEqualTypeOf<DailyStatus>();
  });
  it('changelog y feedback usan los tipos de shared, validados contra el contrato generado', () => {
    expectTypeOf<ChangelogResponse['entries'][number]>().toEqualTypeOf<ChangelogEntry>();
    expectTypeOf<FeedbackCreateResponse['feedback']>().toEqualTypeOf<FeedbackItem>();
  });
  it('el reto diario da un solo juego y result o me con campos nulos hasta terminar', () => {
    expectTypeOf<DailyOverviewResponse['gameId']>().toEqualTypeOf<string>();
    expectTypeOf<DailyOverviewResponse['result']>().toEqualTypeOf<components['schemas']['DailyOverviewResponse.Result'] | null>();
    expectTypeOf<DailyLeaderboardResponse['me']['score']>().toEqualTypeOf<number | null>();
    expectTypeOf<paths['/api/daily/leaderboard']['get']['responses'][403]['content']['application/json']>()
      .toEqualTypeOf<components['schemas']['ApiError']>();
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
  it('las respuestas de administración aceptan los tipos de shared que lee AdminPage', () => {
    type Json<P extends keyof paths, M extends 'get' | 'post'> = NonNullable<paths[P][M]> extends { responses: infer R }
      ? R extends { 200: { content: { 'application/json': infer B } } } ? B : never : never;
    expectTypeOf<AdminSummary>().toEqualTypeOf<components['schemas']['AdminSummary']>();
    expectTypeOf<AdminActiveRoom[]>().toMatchTypeOf<Json<'/api/admin/active-rooms', 'get'>['items']>();
    expectTypeOf<AdminRoomHistoryItem[]>().toMatchTypeOf<Json<'/api/admin/rooms', 'get'>['items']>();
    expectTypeOf<AdminGameHistoryItem[]>().toMatchTypeOf<Json<'/api/admin/games', 'get'>['items']>();
    expectTypeOf<AdminUserItem[]>().toMatchTypeOf<Json<'/api/admin/users', 'get'>['items']>();
    expectTypeOf<AdminDataSyncItem[]>().toMatchTypeOf<Json<'/api/admin/data-sync', 'get'>['sources']>();
    expectTypeOf<Json<'/api/admin/feedback', 'get'>['overview']>().toHaveProperty('newBugs');
    expectTypeOf<paths['/api/admin/users']['get']['responses'][400]['content']['application/json']>()
      .toEqualTypeOf<components['schemas']['ValidationErrorResponse']>();
  });
});
