import type { ShinyOption, ShinyOptionId, ShinyVote } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Check, CheckCircle2, Clock3, Eye, Hourglass, MousePointerClick, Send, Sparkles, TimerOff, XCircle } from 'lucide-react';
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

/** Placa crema de la pantalla inferior: icono, kicker, título, texto y, a la derecha, la acción o los puntos. */
function StatusPlate({ icon, tone, kicker, title, text, aside, wideAside = false, live = false, label }: { icon: LucideIcon; tone: 'ok' | 'bad' | 'info' | 'warn'; kicker: string; title: ReactNode; text?: ReactNode; aside?: ReactNode; /** En el móvil, la acción baja a su propia línea a todo el ancho. */ wideAside?: boolean; live?: boolean; label?: string }) {
  return <Panel variant="cream" as="section" bodyClassName={cx(s.action)} {...(label ? { 'aria-label': label } : {})}>
    <span className={cx(s.actionIcon, s[tone])}><Icon icon={icon} size={32} /></span>
    <div className={s.actionText} {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}>
      <span className={s.kicker}>{kicker}</span>
      <h2 className={s.actionTitle}>{title}</h2>
      {text && <p className={s.help}>{text}</p>}
    </div>
    {aside && <div className={cx(s.actionAside, wideAside && s.actionAsideWide)}>{aside}</div>}
  </Panel>;
}

/**
 * Pantalla inferior de Shiny Quiz: confirmar el voto (con los atajos), el voto ya bloqueado, el modo espectador y, al
 * revelar, el veredicto con los puntos. Los fallos del servidor los avisa la sala: aquí no se repiten.
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
  if (reveal && correctOptionId) {
    const correct = ownVote?.optionId === correctOptionId;
    const title = correct ? '¡Correcto!' : ownVote ? 'No era ese shiny' : participant ? 'Tiempo agotado' : 'Shiny revelado';
    const text = ownVote
      ? <>Tu elección: <strong>{ownVote.optionId}</strong> · Respuesta correcta: <strong>{correctOptionId}</strong></>
      : <>Respuesta correcta: <strong>{correctOptionId}</strong></>;
    return <StatusPlate live icon={correct ? CheckCircle2 : ownVote ? XCircle : participant ? TimerOff : Sparkles} tone={correct ? 'ok' : participant ? 'bad' : 'info'}
      kicker="Revelación" title={title} text={text}
      aside={participant ? <strong className={cx(s.points, correct && s.pointsOk)}>+{correct ? points : 0}<small> puntos</small></strong> : null} />;
  }

  if (!active) return <StatusPlate live icon={Clock3} tone="info" kicker="Shiny Quiz" title="Preparando la ronda…" text="El servidor reparte las cartas de la siguiente ronda." />;

  if (!participant) return <StatusPlate icon={Eye} tone="info" kicker="Sin voto esta ronda" title="Estás observando" text="Estás viendo la votación como espectador." />;

  if (ownVote) return <StatusPlate live icon={Check} tone="ok" kicker="Voto bloqueado" title={<>Voto confirmado: <OptionIdentity id={ownVote.optionId} /></>} text="Esperando al resto de entrenadores." />;

  return <StatusPlate label="Confirmar voto" icon={loading ? Hourglass : MousePointerClick} tone={selectedOption ? 'warn' : 'info'}
    kicker={loading ? 'Un momento' : selectedOption ? 'Has seleccionado' : 'Tu voto'}
    title={loading ? <span role="status">{SHINY_CARDS_LOADING}</span> : selectedOption ? <OptionIdentity id={selectedOption.id} name={selectedOption.pokemonName} /> : 'Selecciona uno de los Pokémon'}
    text={<span className={s.shortcuts}>Atajos: A–F o 1–6 · Enter confirma</span>}
    wideAside
    aside={<Pill variant="yellow" size="main" icon={Send} disabled={!selectedOption} loading={submitting} aria-keyshortcuts="Enter" onClick={onConfirm}>Confirmar voto</Pill>} />;
}
