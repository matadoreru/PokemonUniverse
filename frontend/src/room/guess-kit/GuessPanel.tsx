import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3, Eye, Hourglass, Search, X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Badge, Chip, cx, Icon, Panel, ScorePop } from '../../ui';
import { PokemonSelector } from '../PokemonSelector';
import type { PokemonSearchOption } from '../pokemon-search';
import { attemptsText, guessSearchAutoFocus, guessSeconds, ordinal, pointsWord, type GuessPanelKind, type GuessVerdict } from './presentation';
import { ignoreFailure } from '../room-command';
import s from './GuessPanel.module.css';

const EMPTY_LOCKED = new Set<string>();

/** El buscador de cada juego (se conservan su etiqueta y su `key` por ronda). */
export interface GuessSelectorProps {
  pokemon: readonly PokemonSearchOption[];
  loading: boolean;
  loadError: string;
  onRetry(): void;
  /** Nombre accesible del campo (p. ej. «Buscar respuesta para la ronda 3»). */
  inputLabel: string;
  /** Resultados como mucho (por defecto los 40 del buscador); Bluff Auction usa 5, como antes del rediseño. */
  maxResults?: number | undefined;
  /** Cambia con la ronda: el buscador se vuelve a montar vacío. */
  roundKey: string | number;
  /**
   * Lleva el foco al campo al montarse (sin desplazar la vista; ver `PokemonSelector`). Por defecto no: en los juegos de
   * rondas el foco va al título de la placa. Type Chain lo pide en tu turno para escribir directamente.
   */
  autoFocus?: boolean | undefined;
  /** Pokémon que no se pueden elegir (p. ej. los ya usados en la cadena de Type Chain); por defecto, ninguno. */
  locked?: ReadonlySet<string> | undefined;
  /**
   * Envía el intento (`GUESS_POKEMON`). Su fallo no se pinta aquí (lo dice el aviso global de la sala): el kit lo
   * descarta, así el buscador nunca muestra `caught.message`.
   */
  onGuess(pokemonId: string): Promise<void>;
}

export interface GuessPanelProps {
  kind: GuessPanelKind;
  /** Al título (`h2`, `tabIndex -1`) va el foco al acertar y al revelar (`guessFocusKey`). */
  titleRef: Ref<HTMLHeadingElement>;
  /** Pregunta de la placa al adivinar («¿Quién es ese Pokémon?»). */
  question: string;
  /** Ayuda bajo la pregunta al adivinar (p. ej. cómo se puntúa). No se pinta junto al buscador (solo kicker y título). */
  guessText?: ReactNode;
  /** Adivinar: el buscador. */
  selector?: GuessSelectorProps | undefined;
  /** Lo que queda de espera tras un fallo (`useRemainingMs(player.cooldownUntil)`): se ve, no bloquea la búsqueda. */
  cooldownMs?: number;
  /** Nombre del último intento fallido propio de la ronda (`guessOwnLastAttempt`), si lo hay. */
  lastWrong?: string | null;
  attemptCount?: number;
  /** Acertado: orden de acierto y puntos de la ronda. */
  solveOrder?: number | null;
  roundPoints?: number;
  /** Título al acertar (por defecto «¡Acertado!»). */
  solvedTitle?: string;
  /** Observar: la línea de ayuda (por defecto, que los espectadores no responden). */
  watchingText?: string;
  /** Revelación: veredicto propio (`guessVerdict`) y la cuenta atrás («Siguiente ronda en 4s»). */
  verdict?: GuessVerdict | null;
  countdown?: string;
  /** Nombre del juego para la placa de espera. */
  gameName?: string;
  /**
   * Contenido propio de la placa en lugar del de `kind` (juegos con otros estados, como Pokédle Race: «Intento
   * enviado», «Pokémon encontrado»). `kind` sigue decidiendo si va el buscador (`guess`).
   */
  content?: GuessPlateContent | undefined;
  /**
   * Placa compacta (Sketchmon, donde el lienzo necesita el alto): en escritorio una sola fila (el estado y el buscador)
   * y la bandeja de resultados se abre hacia arriba, superpuesta, sin reservar alto; la ayuda del campo, solo para
   * lectores. Por defecto no: los demás juegos no cambian.
   */
  compact?: boolean | undefined;
}

/** Lo que pinta la placa: icono y tono, kicker, título, ayuda y, a la derecha, el aviso o los puntos. */
export interface GuessPlateContent { icon: LucideIcon; tone: 'ok' | 'bad' | 'info' | 'warn'; kicker: ReactNode; title: string; text?: ReactNode; aside?: ReactNode }
type PlateContent = GuessPlateContent;

/**
 * Pantalla inferior de los juegos de adivinar: el buscador (con el aviso del último fallo o de la espera), el acierto
 * con su puesto y sus puntos, observar, esperar al servidor o el veredicto de la revelación. Ninguna región viva propia:
 * lo que hay que anunciar lo dice la de `GuessScreen` (`guessAnnouncement`).
 */
export function GuessPanel(props: GuessPanelProps) {
  const { kind, titleRef, selector, cooldownMs = 0, compact = false } = props;
  const content = props.content ?? plateContent(props);
  // Con el buscador a la vista, la placa solo lleva el kicker y el título: la descripción sobra junto al campo.
  const searching = kind === 'guess' && Boolean(selector);
  return <Panel variant="cream" as="section" className={cx(compact && s.compact)} bodyClassName={cx(s.plate, kind === 'guess' && s.plateSearch)} aria-labelledby="guess-plate-title">
    <div className={s.plateRow}>
      <span className={cx(s.plateIcon, s[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
      <div className={s.plateText}>
        <span className={s.kicker}>{content.kicker}</span>
        <h2 id="guess-plate-title" ref={titleRef} tabIndex={-1} className={s.plateTitle}>{content.title}</h2>
        {content.text && !searching && <p className={s.help}>{content.text}</p>}
      </div>
      {content.aside && <div className={s.plateAside}>{content.aside}</div>}
    </div>
    {kind === 'guess' && selector && <div className={s.search}>
      <PokemonSelector key={selector.roundKey} pokemon={selector.pokemon} loading={selector.loading} loadError={selector.loadError} onRetry={selector.onRetry}
        locked={selector.locked ?? EMPTY_LOCKED} disabled={false} confirmationDisabled={cooldownMs > 0} variant="embedded" autoFocus={selector.autoFocus ?? guessSearchAutoFocus()} inputLabel={selector.inputLabel} {...(selector.maxResults ? { maxResults: selector.maxResults } : {})}
        onSelect={(pokemonId) => selector.onGuess(pokemonId).catch(ignoreFailure)} />
    </div>}
  </Panel>;
}

function points(value: number, pop: boolean) {
  return <strong className={s.points}>{pop && <ScorePop points={value} color="var(--ok)" placement="before" self />}+{value}<small> {pointsWord(value)}</small></strong>;
}

/** Aviso junto al buscador: la espera tras un fallo (a la vista, oculto a los lectores: ya lo dice la región viva) o el último fallo. */
function searchNote(cooldownMs: number, lastWrong: string | null | undefined): ReactNode {
  if (cooldownMs > 0) return <span aria-hidden="true" data-testid="guess-cooldown"><Chip tone="warn" icon={<Icon icon={Hourglass} size={18} />}>Incorrecto · nuevo intento en {guessSeconds(cooldownMs)}</Chip></span>;
  if (lastWrong) return <Chip tone="bad" icon={<Icon icon={X} size={18} />}><span className={s.noteName}>{lastWrong}</span> no era</Chip>;
  return null;
}

function plateContent({ kind, question, guessText, cooldownMs = 0, lastWrong, attemptCount = 0, solveOrder, roundPoints = 0, solvedTitle = '¡Acertado!', watchingText, verdict, countdown, gameName }: GuessPanelProps): PlateContent {
  switch (kind) {
    case 'guess': return { icon: Search, tone: 'info', kicker: attemptCount > 0 ? `Tu respuesta · ${attemptsText(attemptCount)}` : 'Tu respuesta', title: question, ...(guessText ? { text: guessText } : {}), aside: searchNote(cooldownMs, lastWrong) };
    case 'solved': return {
      icon: CheckCircle2, tone: 'ok', kicker: solveOrder ? <Badge>{ordinal(solveOrder)} en acertar</Badge> : 'Acertado', title: solvedTitle,
      text: 'La respuesta sigue oculta para los demás.', aside: points(roundPoints, true),
    };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'No adivinas en esta ronda', title: 'Estás observando', text: watchingText ?? 'Los espectadores no pueden enviar respuestas: la pista y los aciertos aparecen en directo.' };
    case 'out': return { icon: Eye, tone: 'info', kicker: 'Estás observando', title: 'No juegas esta partida', text: 'Entraste con la partida empezada: jugarás en la siguiente. La pista y los aciertos aparecen en directo.' };
    case 'reveal': return {
      icon: verdict?.tone === 'ok' ? CheckCircle2 : verdict?.tone === 'bad' ? X : Eye, tone: verdict?.tone ?? 'info', kicker: verdict?.text ?? 'Resultado de la ronda', title: countdown ?? 'Resultado de la ronda',
      ...(verdict && verdict.points > 0 ? { aside: points(verdict.points, false) } : {}),
    };
    default: return { icon: Clock3, tone: 'info', kicker: gameName ?? 'Ronda', title: 'Esperando al servidor…', text: 'La ronda empieza en un momento.' };
  }
}
