import type { ShinyOption, ShinyOptionId, ShinyVote } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { useRef, type ReactNode, type Ref } from 'react';
import { Check, CheckCircle2, Clock3, Eye, Hourglass, MousePointerClick, Send, Sparkles, TimerOff, XCircle } from 'lucide-react';
import { useFocusOnTransition } from '../../room/focus-transition';
import { cx, Icon, Panel, Pill } from '../../ui';
import { SHINY_CARDS_LOADING } from './reveal';
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
  tone: 'ok' | 'bad' | 'info' | 'warn';
  kicker: string;
  title: ReactNode;
  text?: ReactNode;
  aside?: ReactNode;
  /** En el móvil, la acción baja a su propia línea a todo el ancho. */
  wideAside?: boolean;
  label?: string;
}

/**
 * Placa crema de la pantalla inferior: icono, kicker, título, texto y, a la derecha, la acción o los puntos. El aviso
 * para lectores de pantalla va en una región `status` que está siempre montada (solo cambia su texto): así se anuncia
 * cada cambio. El título admite foco por programa (`tabIndex={-1}`) para devolverle el foco cuando su control desaparece.
 */
function StatusPlate({ icon, tone, kicker, title, text, aside, wideAside = false, label, announcement, titleRef }: PlateProps & { announcement: string; titleRef: Ref<HTMLHeadingElement> }) {
  return <Panel variant="cream" as="section" bodyClassName={cx(s.action)} {...(label ? { 'aria-label': label } : {})}>
    <span className={cx(s.actionIcon, s[tone])}><Icon icon={icon} size={32} /></span>
    <div className={s.actionText}>
      <span className={s.kicker}>{kicker}</span>
      <h2 ref={titleRef} tabIndex={-1} className={s.actionTitle}>{title}</h2>
      {text && <p className={s.help}>{text}</p>}
    </div>
    {aside && <div className={cx(s.actionAside, wideAside && s.actionAsideWide)}>{aside}</div>}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </Panel>;
}

/** Texto del aviso de la región `status` (cambia solo cuando cambia el estado que importa al jugador). */
export function shinyStatusAnnouncement({ active, loading, reveal, participant, ownVote, correctOptionId, points }: {
  active: boolean;
  loading: boolean;
  reveal: boolean;
  participant: boolean;
  ownVote: ShinyVote | null;
  correctOptionId: ShinyOptionId | null;
  points: number;
}): string {
  if (reveal && correctOptionId) {
    const correct = ownVote?.optionId === correctOptionId;
    const verdict = correct ? `Has acertado: +${points} puntos.` : ownVote ? 'Has fallado: +0 puntos.' : participant ? 'Tiempo agotado: +0 puntos.' : '';
    return `Revelación: la respuesta correcta es la ${correctOptionId}. ${verdict}`.trim();
  }
  if (!active) return 'Preparando la ronda.';
  if (!participant) return '';
  if (ownVote) return `Voto registrado: opción ${ownVote.optionId}. Esperando al resto de entrenadores.`;
  return loading ? SHINY_CARDS_LOADING : 'Cartas listas: elige una opción.';
}

/**
 * Pantalla inferior de Shiny Quiz: confirmar el voto (con los atajos), el voto ya bloqueado, el modo espectador y, al
 * revelar, el veredicto con los puntos. Los fallos del servidor los avisa la sala: aquí no se repiten.
 *
 * Foco: al confirmar, la píldora y las cartas-botón desaparecen (el foco caería en `body`); al pasar al voto bloqueado o
 * a la revelación, si el foco se ha perdido, va al título de la placa. Si el jugador tiene el foco en otro sitio, no se toca.
 */
export function ShinyVoteStatus({ active, loading = false, reveal, participant, selectedOption, ownVote, correctOptionId, points, submitting, onConfirm }: {
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
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const revealed = reveal && correctOptionId !== null;
  const focusKey = revealed ? `reveal-${correctOptionId}` : ownVote ? `vote-${ownVote.optionId}` : null;
  // Al montarse (recarga, volver a la sala) no se mueve el foco: solo en un cambio real de estado.
  useFocusOnTransition(focusKey, titleRef);
  const announcement = shinyStatusAnnouncement({ active, loading, reveal, participant, ownVote, correctOptionId, points });
  return <StatusPlate {...shinyPlate({ active, loading, revealed, participant, selectedOption, ownVote, correctOptionId, points, submitting, onConfirm })} announcement={announcement} titleRef={titleRef} />;
}

function shinyPlate({ active, loading, revealed, participant, selectedOption, ownVote, correctOptionId, points, submitting, onConfirm }: {
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
}): PlateProps {
  if (revealed && correctOptionId) {
    const correct = ownVote?.optionId === correctOptionId;
    const title = correct ? '¡Correcto!' : ownVote ? 'No era ese shiny' : participant ? 'Tiempo agotado' : 'Shiny revelado';
    const text = ownVote
      ? <>Tu elección: <strong>{ownVote.optionId}</strong> · Respuesta correcta: <strong>{correctOptionId}</strong></>
      : <>Respuesta correcta: <strong>{correctOptionId}</strong></>;
    return { icon: correct ? CheckCircle2 : ownVote ? XCircle : participant ? TimerOff : Sparkles, tone: correct ? 'ok' : participant ? 'bad' : 'info',
      kicker: 'Revelación', title, text,
      aside: participant ? <strong className={s.points}>+{correct ? points : 0}<small> puntos</small></strong> : null };
  }

  if (!active) return { icon: Clock3, tone: 'info', kicker: 'Shiny Quiz', title: 'Preparando la ronda…', text: 'El servidor reparte las cartas de la siguiente ronda.' };

  if (!participant) return { icon: Eye, tone: 'info', kicker: 'Sin voto esta ronda', title: 'Estás observando', text: 'Estás viendo la votación como espectador.' };

  if (ownVote) return { icon: Check, tone: 'ok', kicker: 'Voto bloqueado', title: <>Voto confirmado: <OptionIdentity id={ownVote.optionId} /></>, text: 'Esperando al resto de entrenadores.' };

  return { label: 'Confirmar voto', icon: loading ? Hourglass : MousePointerClick, tone: selectedOption ? 'warn' : 'info',
    kicker: loading ? 'Un momento' : selectedOption ? 'Has seleccionado' : 'Tu voto',
    title: loading ? SHINY_CARDS_LOADING : selectedOption ? <OptionIdentity id={selectedOption.id} name={selectedOption.pokemonName} /> : 'Selecciona uno de los Pokémon',
    text: <span className={s.shortcuts}>Atajos: A–F o 1–6 · Enter confirma</span>,
    wideAside: true,
    aside: <Pill variant="yellow" size="main" icon={Send} disabled={!selectedOption} loading={submitting} aria-keyshortcuts="Enter" onClick={onConfirm}>Confirmar voto</Pill> };
}
