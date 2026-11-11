import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audio } from '../audio';
import type { PokemonType } from '../styles/tokens';
import { TypeBadge } from './Badge';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './Card.module.css';

export type CardState = 'idle' | 'selected' | 'correct' | 'wrong' | 'revealing';

/** Atributos extra del elemento de la carta (botón o caja): nombre accesible, atajos, foco itinerante y `data-*` de quien la usa. */
export type CardAttrs = { 'aria-label'?: string; 'aria-keyshortcuts'?: string; /** Foco itinerante de una rejilla de cartas (0 la que entra con Tab, -1 el resto). */ tabIndex?: number } & { [key: `data-${string}`]: string | undefined };

export interface CardProps {
  sprite?: string;
  name: string;
  number?: number;
  types?: { type: PokemonType; label: string }[];
  state?: CardState;
  /**
   * La imagen es una ilustración o foto (avatar), no un sprite: se escala suave, va en círculo y es decorativa
   * (`alt=""`), porque el nombre ya va escrito debajo.
   */
  photo?: boolean;
  /**
   * Pequeña (`sm`): sprite de 56 px y menos relleno (rejillas de resultados). Llena (`fill`): ocupa toda su celda y el
   * hueco del sprite crece con ella (rejillas de opciones de un juego, donde el sprite es lo que se mira).
   */
  size?: 'md' | 'sm' | 'fill';
  /**
   * Gira al montarse o al pasar a `true` (como `revealing`), con cualquier estado: la carta correcta se descubre y queda
   * marcada como correcta. Suena igual que `revealing`.
   */
  flip?: boolean;
  /** Ver `CardAttrs`. */
  attrs?: CardAttrs;
  /** Sprite decorativo (`alt=""`) cuando el nombre escrito basta, para que el nombre accesible sea solo el nombre. */
  decorativeSprite?: boolean;
  /**
   * Carga la imagen ya y con prioridad alta (sin `loading="lazy"`): para la carta protagonista de una revelación breve,
   * cuyo sprite no se puede precargar antes sin desvelar la respuesta.
   */
  eager?: boolean;
  /** Con `onSelect`: botón de acción (elegir) en vez de conmutador, sin `aria-pressed`. */
  action?: boolean;
  /** Con `onSelect`: botón deshabilitado. */
  disabled?: boolean;
  /**
   * Arte decorativo en el hueco del sprite cuando no hay imagen (p. ej. el icono de un minijuego). Va oculto a los
   * lectores de pantalla: el nombre de la carta ya lo dice.
   */
  art?: ReactNode;
  /**
   * Dónde se marca el estado. `line` (por defecto): «Correcta» / «Incorrecta» en una línea bajo el nombre. `corner`:
   * un disco con el icono en la esquina del hueco del sprite (el texto, solo para lectores de pantalla) y también la
   * seleccionada lleva su tic; así el hueco del sprite mide lo mismo en reposo, elegida y al revelar.
   */
  marks?: 'line' | 'corner';
  /** Capa sobre el hueco del sprite, abajo a la derecha (p. ej. los avatares de quién la eligió): no ocupa alto. */
  artOverlay?: ReactNode;
  onSelect?: () => void;
  children?: ReactNode;
}

/** Reintentos de un sprite que falla (un fallo pasajero del proxy de sprites o del origen) antes de dejar el «?». */
export const CARD_IMAGE_RETRIES = 2;
/** Espera antes de cada reintento, en ms (crece con el intento). */
export const CARD_IMAGE_RETRY_MS = 600;

/**
 * URL del intento `attempt` de una imagen: el primero tal cual y los reintentos con un parámetro propio para que el
 * navegador no sirva el fallo de su caché. `data:` y `blob:` no admiten parámetros: se quedan igual.
 */
export function cardImageSource(src: string, attempt: number): string {
  if (attempt <= 0 || /^(data|blob):/i.test(src)) return src;
  const hashAt = src.indexOf('#');
  const base = hashAt < 0 ? src : src.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : src.slice(hashAt);
  return `${base}${base.includes('?') ? '&' : '?'}reintento=${attempt}${hash}`;
}

/** Qué hacer cuando falla el intento `attempt` (0 el primero): reintentar tras una espera creciente o rendirse. */
export function cardImageAfterError(attempt: number): { retryInMs: number } | 'failed' {
  return attempt >= CARD_IMAGE_RETRIES ? 'failed' : { retryInMs: CARD_IMAGE_RETRY_MS * (attempt + 1) };
}

/**
 * Sprite de la carta. Si falla (un 502/503 pasajero o un origen lento que corta), se reintenta `CARD_IMAGE_RETRIES`
 * veces con una URL nueva y, si sigue fallando, queda el «?» en lugar de un hueco vacío para siempre.
 */
function CardImage({ src, alt, eager, className }: { src: string; alt: string; eager: boolean; className: string | undefined }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function onError() {
    const next = cardImageAfterError(attempt);
    if (next === 'failed') { setFailed(true); return; }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAttempt((value) => value + 1), next.retryInMs);
  }
  if (failed) return <span className={s.placeholder} aria-hidden="true">?</span>;
  return <img src={cardImageSource(src, attempt)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchPriority: 'high' as const } : {})} className={className} onError={onError} data-attempt={attempt > 0 ? attempt : undefined} />;
}

/** Marca de esquina (`marks="corner"`): correcta, incorrecta o elegida; el texto, solo para lectores de pantalla. */
function CornerMark({ state }: { state: CardState }) {
  if (state === 'correct') return <span className={cx(s.mark, s.markOk)} data-mark="correct"><Icon icon={Check} size={18} /><span className="sr-only">Correcta</span></span>;
  if (state === 'wrong') return <span className={cx(s.mark, s.markBad)} data-mark="wrong"><Icon icon={X} size={18} /><span className="sr-only">Incorrecta</span></span>;
  if (state === 'selected') return <span className={cx(s.mark, s.markSelected)} data-mark="selected" aria-hidden="true"><Icon icon={Check} size={18} /></span>;
  return null;
}

/** Carta de Pokémon; con `onSelect` es un botón conmutador. Correcta/incorrecta llevan icono y texto además del color. */
export function Card({ sprite, name, number, types, state = 'idle', photo, size = 'md', flip = false, attrs, decorativeSprite, eager = false, action, disabled, art, marks = 'line', artOverlay, onSelect, children }: CardProps) {
  // Suena al empezar a girar (`revealing` o `flip`): la carta se da la vuelta delante del jugador. A propósito, una carta
  // que se monta ya girada no suena: llega con una pantalla de revelado entera (varias cartas a la vez), que ya tiene su
  // `game.reveal` común (`roomRevealKey`); sonar aquí lo duplicaría una vez por carta.
  const turning = state === 'revealing' || flip;
  const before = useRef(turning);
  useEffect(() => {
    if (turning && !before.current) audio.play('game.flip');
    before.current = turning;
  }, [turning]);
  const body = (
    <>
      {/* `data-part` («art», «name»): ganchos estables para el CSS de los juegos, que no dependen del orden de los hijos. */}
      <span className={cx(s.art, photo && s.photoArt)} data-part="art">
        {sprite ? (
          <CardImage key={sprite} src={sprite} alt={photo || decorativeSprite ? '' : name} eager={eager} className={cx(s.img, photo && s.photo)} />
        ) : art != null ? (
          <span className={s.glyph} aria-hidden="true">
            {art}
          </span>
        ) : (
          <span className={s.placeholder} aria-hidden="true">?</span>
        )}
        {marks === 'corner' && <CornerMark state={state} />}
        {artOverlay != null && <span className={s.overlay}>{artOverlay}</span>}
      </span>
      {/* Llena, el nombre largo se recorta con elipsis: `title` deja leerlo entero. */}
      <span className={s.name} data-part="name" {...(size === 'fill' ? { title: name } : {})}>{name}</span>
      {number != null && <span className={s.num}>Nº {String(number).padStart(3, '0')}</span>}
      {types && types.length > 0 && (
        <span className={s.types}>
          {types.map((t) => (
            <TypeBadge key={t.type} type={t.type} label={t.label} size="sm" />
          ))}
        </span>
      )}
      {marks === 'line' && state === 'correct' && (
        <span className={cx(s.verdict, s.okText)}>
          <Icon icon={Check} size={18} />
          Correcta
        </span>
      )}
      {marks === 'line' && state === 'wrong' && (
        <span className={cx(s.verdict, s.badText)}>
          <Icon icon={X} size={18} />
          Incorrecta
        </span>
      )}
      {children}
    </>
  );
  const cls = cx(s.card, s[state], size === 'sm' && s.sm, size === 'fill' && s.fill, flip && s.flip, onSelect && s.button);
  if (onSelect) {
    return (
      <button type="button" {...attrs} className={cls} aria-pressed={action ? undefined : state === 'selected'} disabled={disabled} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return <div {...attrs} className={cls}>{body}</div>;
}
