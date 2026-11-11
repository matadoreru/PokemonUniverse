import type { ShinyOption, ShinyOptionId, ShinyVote } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { useId, useRef, type ReactNode, type Ref } from 'react';
import { Check, CheckCircle2, Clock3, Eye, Hourglass, MousePointerClick, Send, Sparkles, TimerOff, UserX, XCircle } from 'lucide-react';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { ActionPlate, cx, Kbd, Pill, type ActionPlateTone } from '../../ui';
import { SHINY_CARDS_LOADING } from './reveal';
import { roundsLabel } from '../../lib/format';
import s from './ShinyVote.module.css';

/** Letra de la opción en su disco amarillo y el nombre del Pokémon. */
function OptionIdentity({ id, name }: { id: ShinyOptionId; name?: string | undefined }) {
  return <span className={s.identity}>
    <span className={cx(s.letter, s.letterOn, s.letterInline)}>{id}</span>
    {name && <span className={s.identityName} title={name}>{name}</span>}
  </span>;
}

interface PlateProps {
  icon: LucideIcon;
  tone: ActionPlateTone;
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  aside?: ReactNode;
  /** En el móvil, la acción baja a su propia línea a todo el ancho. */
  wideAside?: boolean;
}

/**
 * Placa de acción del catálogo (`ActionPlate`) con el aviso para lectores en una región `status` siempre montada (solo
 * cambia su texto): así se anuncia cada cambio. Al título va el foco por programa cuando su control desaparece.
 */
function StatusPlate({ icon, tone, kicker, title, text, aside, wideAside = false, announcement, titleRef }: PlateProps & { announcement: string; titleRef: Ref<HTMLHeadingElement> }) {
  const titleId = useId();
  return <ActionPlate titleId={titleId} titleRef={titleRef} icon={icon} tone={tone} kicker={kicker} title={title} text={text}
    aside={aside} helpClassName={s.help} asideClassName={cx(wideAside && s.actionAsideWide)}>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </ActionPlate>;
}

/**
 * Supervivencia: `eliminated` es quien cayó en una ronda anterior (ya no juega la actual) y `roundsSurvived` sus rondas
 * superadas. Sin este objeto, el Clásico.
 */
export interface ShinySurvivalStatus {
  eliminated: boolean;
  roundsSurvived: number;
}

function roundsText(rounds: number, suffix: string): string {
  return `${rounds} ${rounds === 1 ? `ronda ${suffix}` : `rondas ${suffix}s`}`;
}

/** Texto del aviso de la región `status` (cambia solo cuando cambia el estado que importa al jugador). */
export function shinyStatusAnnouncement({ active, loading, reveal, participant, ownVote, correctOptionId, points, survival = null }: {
  active: boolean;
  loading: boolean;
  reveal: boolean;
  participant: boolean;
  ownVote: ShinyVote | null;
  correctOptionId: ShinyOptionId | null;
  points: number;
  survival?: ShinySurvivalStatus | null;
}): string {
  if (reveal && correctOptionId) {
    const correct = ownVote?.optionId === correctOptionId;
    const verdict = survival
      ? correct ? 'Has acertado: sigues en pie.' : ownVote ? 'Has fallado: quedas eliminado.' : participant ? 'Tiempo agotado: quedas eliminado.' : ''
      : correct ? `Has acertado: +${points} puntos.` : ownVote ? 'Has fallado: +0 puntos.' : participant ? 'Tiempo agotado: +0 puntos.' : '';
    return `Revelación: la respuesta correcta es la ${correctOptionId}. ${verdict}`.trim();
  }
  if (!active) return 'Preparando la ronda.';
  if (survival?.eliminated) return 'Estás eliminado: sigues la partida como espectador.';
  if (!participant) return '';
  if (ownVote) return `Voto registrado: opción ${ownVote.optionId}. Esperando al resto de entrenadores.`;
  return loading ? SHINY_CARDS_LOADING : 'Cartas listas: elige una opción.';
}

/**
 * Pantalla inferior de Shiny Quiz: confirmar el voto (con los atajos), el voto ya bloqueado, el modo espectador y, al
 * revelar, el veredicto con los puntos. Los fallos del servidor los avisa la sala: aquí no se repiten. En Supervivencia
 * (`survival`) el veredicto dice si sigues en pie o caes, con las rondas superadas, y quien ya cayó mira la partida.
 *
 * Foco: al confirmar, la píldora y las cartas-botón desaparecen (el foco caería en `body`); al pasar al voto bloqueado o
 * a la revelación, si el foco se ha perdido, va al título de la placa. Si el jugador tiene el foco en otro sitio, no se toca.
 */
export function ShinyVoteStatus({ active, loading = false, reveal, participant, selectedOption, ownVote, correctOptionId, points, submitting, onConfirm, survival = null }: {
  active: boolean;
  /** Las cartas de la ronda aún se están cargando. */
  loading?: boolean;
  reveal: boolean;
  participant: boolean;
  selectedOption: ShinyOption | null;
  ownVote: ShinyVote | null;
  correctOptionId: ShinyOptionId | null;
  points: number;
  submitting: boolean;
  onConfirm(): void;
  survival?: ShinySurvivalStatus | null;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const revealed = reveal && correctOptionId !== null;
  const focusKey = revealed ? `reveal-${correctOptionId}` : ownVote ? `vote-${ownVote.optionId}` : null;
  // Al montarse (recarga, volver a la sala) no se mueve el foco: solo en un cambio real de estado.
  useFocusOnTransition(focusKey, titleRef);
  const announcement = shinyStatusAnnouncement({ active, loading, reveal, participant, ownVote, correctOptionId, points, survival });
  return <StatusPlate {...shinyPlate({ active, loading, revealed, participant, selectedOption, ownVote, correctOptionId, points, submitting, onConfirm, survival })} announcement={announcement} titleRef={titleRef} />;
}

function shinyPlate({ active, loading, revealed, participant, selectedOption, ownVote, correctOptionId, points, submitting, onConfirm, survival }: {
  active: boolean;
  loading: boolean;
  revealed: boolean;
  participant: boolean;
  selectedOption: ShinyOption | null;
  ownVote: ShinyVote | null;
  correctOptionId: ShinyOptionId | null;
  points: number;
  submitting: boolean;
  onConfirm(): void;
  survival: ShinySurvivalStatus | null;
}): PlateProps {
  if (revealed && correctOptionId) {
    const correct = ownVote?.optionId === correctOptionId;
    const title = correct ? '¡Correcto!' : ownVote ? 'No era ese shiny' : participant ? 'Tiempo agotado' : 'Shiny revelado';
    if (survival && participant) {
      const rounds = survival.roundsSurvived;
      return { icon: correct ? CheckCircle2 : ownVote ? XCircle : TimerOff, tone: correct ? 'ok' : 'bad', kicker: 'Revelación', title,
        text: <><strong>{correct ? `Sigues en pie · ${roundsText(rounds, 'superada')}` : `Quedas eliminado con ${roundsText(rounds, 'superada')}.`}</strong> · Respuesta correcta: <strong>{correctOptionId}</strong></>,
        aside: <strong className={s.points}>{rounds}<small>{rounds === 1 ? ' ronda' : ' rondas'}</small></strong> };
    }
    const text = ownVote
      ? <>Tu elección: <strong>{ownVote.optionId}</strong> · Respuesta correcta: <strong>{correctOptionId}</strong></>
      : <>Respuesta correcta: <strong>{correctOptionId}</strong></>;
    return { icon: correct ? CheckCircle2 : ownVote ? XCircle : participant ? TimerOff : Sparkles, tone: correct ? 'ok' : participant ? 'bad' : 'info',
      kicker: 'Revelación', title, text,
      aside: participant ? <strong className={s.points}>+{correct ? points : 0}<small> puntos</small></strong> : null };
  }

  if (survival?.eliminated) {
    return { icon: UserX, tone: 'bad', kicker: 'Eliminado', title: 'Estás fuera',
      text: `Superaste ${roundsLabel(survival.roundsSurvived)}. Sigues la partida como espectador.` };
  }

  if (!active) return { icon: Clock3, tone: 'info', kicker: 'Shiny Quiz', title: 'Preparando la ronda…', text: 'El servidor reparte las cartas de la siguiente ronda.' };

  if (!participant) return { icon: Eye, tone: 'info', kicker: 'Sin voto esta ronda', title: 'Estás observando', text: 'Estás viendo la votación como espectador.' };

  if (ownVote) return { icon: Check, tone: 'ok', kicker: 'Voto bloqueado', title: <>Voto confirmado: <OptionIdentity id={ownVote.optionId} /></>, text: 'Esperando al resto de entrenadores.' };

  return { icon: loading ? Hourglass : MousePointerClick, tone: selectedOption ? 'warn' : 'info',
    kicker: loading ? 'Un momento' : selectedOption ? 'Has seleccionado' : 'Tu voto',
    title: loading ? SHINY_CARDS_LOADING : selectedOption ? <OptionIdentity id={selectedOption.id} name={selectedOption.pokemonName} /> : 'Selecciona uno de los Pokémon',
    text: <span className={s.shortcuts}>Atajos: A–F o 1–6 · Enter confirma</span>,
    wideAside: true,
    aside: <Pill variant="yellow" size="main" icon={Send} disabled={!selectedOption} loading={submitting} aria-keyshortcuts="Enter" onClick={onConfirm}>Confirmar voto <Kbd fineOnly>Intro</Kbd></Pill> };
}
