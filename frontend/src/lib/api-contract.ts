import type { AuthUser, ChangelogEntry, FeedbackItem } from '@pokemon-universe/shared/public';
import type { paths } from './api-types';

/** Cuerpo JSON de una respuesta del contrato OpenAPI del backend (tipos generados en api-types.ts). */
type JsonBody<P extends keyof paths, M extends keyof paths[P], S extends number> =
  paths[P][M] extends { responses: Record<S, { content: { 'application/json': infer B } }> } ? B : never;

/**
 * Puente tipado entre el contrato generado (`Wire`) y el tipo público de shared (`Public`).
 * El OpenAPI de Java es mas laxo que shared (enums como string, `email?: string | null`), asi que el
 * tipo generado no es asignable al de shared. `Public extends Wire` hace fallar la compilacion si el
 * tipo de shared deja de ser asignable al contrato generado (deriva del contrato Java); no hay casts de valor.
 */
type Bridge<Wire, Public extends Wire> = Public;

export type MeResponse = { user: Bridge<NonNullable<JsonBody<'/api/auth/me', 'get', 200>['user']>, AuthUser> | null };
export type LoginResponse = { user: Bridge<JsonBody<'/api/auth/login', 'post', 200>['user'] & {}, AuthUser> };
export type RegisterResponse = { user: Bridge<JsonBody<'/api/auth/register', 'post', 201>['user'] & {}, AuthUser> };
export type GuestResponse = { user: Bridge<JsonBody<'/api/auth/guest', 'post', 201>['user'] & {}, AuthUser> };
/**
 * Sin puente (los call sites de perfil y juegos siguen con los tipos de shared): shared usa arrays `readonly`
 * y `boolean` no nulo donde el contrato generado tiene arrays mutables y `boolean | null`.
 */
export type ProfileResponse = JsonBody<'/api/auth/profile', 'get', 200>;
export type ChangelogResponse = { entries: Bridge<JsonBody<'/api/changelog', 'get', 200>['entries'][number], ChangelogEntry>[] };
export type FeedbackCreateResponse = { feedback: Bridge<JsonBody<'/api/feedback', 'post', 201>['feedback'], FeedbackItem> };
export type GamesResponse = JsonBody<'/api/games', 'get', 200>;
export type PokemonSelectorResponse = JsonBody<'/api/pokemon/selector', 'get', 200>;
