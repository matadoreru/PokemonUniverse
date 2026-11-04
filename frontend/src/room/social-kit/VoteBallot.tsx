import { CheckCircle2, Eye, Lock, Scale, Vote } from 'lucide-react';
import { useRef, useState, type ReactNode, type Ref } from 'react';
import { useRunoffVote } from '../../hooks/useRunoffVote';
import { useRefocusAfterReject } from '../focus-transition';
import { Card, Chip, cx, Icon, Pill, TextCard } from '../../ui';
import { ballotState } from './presentation';
import { SocialPlate, type SocialPlateContent } from './SocialPlate';
import s from './VoteBallot.module.css';

/** Una opción de la papeleta: un Pokémon (`Card`) o un texto/jugador (`kind="text"`). */
export interface BallotOption {
  /** Id que se vota (el del candidato del motor: jugador o respuesta). */
  id: string;
  /** Lo que se lee grande: el nombre del Pokémon, «Respuesta 2» o el nombre del jugador. Nunca un texto largo. */
  name: string;
  /**
   * Nombre accesible del botón (p. ej. «Pikachu, respuesta de Ana»): dos opciones con el mismo Pokémon se distinguen.
   * En los juegos anónimos (Red Flag) no lleva el autor.
   */
  ariaLabel: string;
  /** Sprite del Pokémon (`kind="card"`). */
  sprite?: string;
  /** Línea bajo el nombre (p. ej. «de Ana»). */
  detail?: ReactNode;
  /** Texto largo de la respuesta (`kind="text"`): se parte en líneas, nunca se recorta. */
  text?: ReactNode;
  /** Imagen pequeña a la izquierda (`kind="text"`), p. ej. el avatar del jugador. */
  media?: ReactNode;
}

export interface VoteBallotProps {
  titleRef: Ref<HTMLHeadingElement>;
  /** Ronda de la partida y vuelta de la votación (`voteRoundNumber`): la papeleta empieza de cero al cambiar cualquiera. */
  roundNumber: number;
  voteRound: number;
  /** Todas las opciones reveladas; en la segunda vuelta solo se ofrecen las de `candidateIds`. */
  options: readonly BallotOption[];
  /** Candidatos de esta vuelta (`voteCandidates`). */
  candidateIds: readonly string[];
  /** Segunda vuelta (`REVOTE`): solo los empatados, con su título y su ayuda. */
  runoff: boolean;
  /** Opción propia (no se puede votar): sale como carta fija con «Tu respuesta». `null` si no hay. */
  ownId: string | null;
  /** Voto propio que confirmó el servidor (`ownVote…Id`): papeleta bloqueada. */
  ownVote: string | null;
  /** Puede votar ahora (`player.canVote`). */
  canVote: boolean;
  /** Juega la partida (si no, «Estás observando» con las opciones a la vista). */
  participating: boolean;
  /**
   * Envía el voto (`VOTE_…`). Pasa la promesa tal cual, SIN `.catch`: si el servidor lo rechaza, `useRunoffVote` suelta la
   * papeleta para volver a intentarlo. El error no se pinta aquí: ya lo dice el aviso global de la sala.
   */
  onVote(id: string): Promise<void>;
  /** `card` (Pokémon, por defecto) o `text` (respuestas escritas o jugadores). */
  kind?: 'card' | 'text';
  title?: string;
  runoffTitle?: string;
  help?: ReactNode;
  runoffHelp?: ReactNode;
  confirmLabel?: string;
  /** Texto de la opción propia (por defecto «Tu respuesta»). */
  ownLabel?: string;
  /** Ayuda con el voto bloqueado. */
  lockedText?: ReactNode;
  /** Ayuda de quien observa o no puede votar. */
  watchingText?: ReactNode;
  className?: string | undefined;
}

/**
 * Papeleta secreta (pantalla de abajo): las opciones como cartas (o textos) seleccionables con `aria-pressed`, la
 * píldora «Confirmar voto» y, al confirmar, el voto bloqueado (la elegida queda marcada con «Tu voto» y el resto fijas).
 * En la segunda vuelta solo ofrece a los empatados. La opción propia nunca es un botón. Quien observa ve las opciones,
 * sin botones.
 *
 * Usa `useRunoffVote` (un envío a la vez; si falla, se puede volver a intentar). La elección local y el hook empiezan de
 * cero con cada ronda y cada vuelta (también si la vuelta se repite como 1 en la ronda siguiente).
 *
 * Privacidad: solo sabe el voto propio. Nunca recibe ni pinta votos de otros ni recuentos (eso es `VoteTally`).
 */
export function VoteBallot(props: VoteBallotProps) {
  const {
    titleRef, roundNumber, voteRound, options, candidateIds, runoff, ownId, ownVote, canVote, participating, onVote, kind = 'card',
    title = 'Vota la mejor respuesta', runoffTitle = 'Vota entre las empatadas', help = 'No puedes votar tu propia respuesta.',
    runoffHelp = 'Hubo empate: solo se vota entre las empatadas.', confirmLabel = 'Confirmar voto', ownLabel = 'Tu respuesta',
    lockedText = 'Tu voto es secreto hasta el resultado.', watchingText = 'Las opciones están a la vista; los votos se revelan al final.', className,
  } = props;
  // Una época por ronda y vuelta (la vuelta vuelve a ser 1 en la ronda siguiente): el hook y la elección se reinician.
  const epoch = roundNumber * 100 + voteRound;
  const { busyId, vote } = useRunoffVote(epoch, onVote);
  const [pick, setPick] = useState<{ epoch: number; id: string } | null>(null);
  const offered = options.filter((option) => candidateIds.includes(option.id));
  const { locked, sending, open, picked, selected } = ballotState({ epoch, pick, candidateIds, ownId, ownVote, busyId, canVote, participating });
  const chosen = offered.find((option) => option.id === selected) ?? null;
  // Voto rechazado: «Confirmar voto» se deshabilitó mientras iba la petición; el foco vuelve a él, no al `body`.
  const confirmRef = useRef<HTMLButtonElement>(null);
  useRefocusAfterReject(epoch, sending, open, confirmRef);

  const content: SocialPlateContent = locked
    ? { icon: Lock, tone: 'ok', kicker: runoff ? 'Segunda vuelta' : 'Tu voto', title: 'Voto bloqueado', text: lockedText, aside: <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Votaste</Chip> }
    : open
      ? {
        icon: runoff ? Scale : Vote, tone: runoff ? 'warn' : 'info', kicker: runoff ? 'Empate · vota otra vez' : 'Papeleta secreta', title: runoff ? runoffTitle : title, text: runoff ? runoffHelp : help,
      }
      : { icon: Eye, tone: 'info', kicker: runoff ? 'Segunda vuelta' : 'Votación', title: participating ? 'Esperando al resto' : 'Estás observando', text: participating ? 'En esta vuelta no tienes a quién votar.' : watchingText };

  return <SocialPlate titleRef={titleRef} content={content} className={cx(s.ballot, className)} bodyClassName={cx(s.body, open && s.bodyOpen)} textClassName={cx(s.help)}>
    <ul className={cx(s.options, kind === 'text' && s.textOptions)} aria-label={runoff ? 'Opciones empatadas' : 'Opciones de la votación'} data-testid="ballot-options">
      {offered.map((option) => {
        const own = option.id === ownId;
        const isSelected = selected === option.id;
        const votable = open && !own && !sending;
        const choose = () => setPick(isSelected ? null : { epoch, id: option.id });
        const note = own ? <Chip tone="neutral">{ownLabel}</Chip> : isSelected && locked ? <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Tu voto</Chip> : runoff ? <Chip tone="warn">Empate</Chip> : null;
        return <li key={option.id} className={s.option} data-ballot-option={option.id}>
          {kind === 'card'
            ? <Card name={option.name} {...(option.sprite ? { sprite: option.sprite } : {})} decorativeSprite size="sm" state={isSelected ? 'selected' : 'idle'}
              {...(votable ? { attrs: { 'aria-label': option.ariaLabel }, onSelect: choose } : {})}>
              {option.detail && <span className={s.detail}>{option.detail}</span>}
              {note}
            </Card>
            : <TextCard name={option.name} {...(option.text != null ? { text: option.text } : {})} {...(option.detail != null ? { detail: option.detail } : {})} {...(option.media != null ? { media: option.media } : {})}
              selected={isSelected} {...(votable ? { ariaLabel: option.ariaLabel, onSelect: choose } : {})}>{note}</TextCard>}
        </li>;
      })}
    </ul>
    {open && <div className={s.actions}>
      <p className={s.choice}>{chosen ? <>Has elegido <strong>{chosen.ariaLabel}</strong></> : 'Elige una opción y confirma tu voto.'}</p>
      <Pill ref={confirmRef} variant="yellow" icon={Vote} loading={sending} disabled={!picked && !sending} onClick={() => { if (picked) void vote(picked); }} data-testid="ballot-confirm">{confirmLabel}</Pill>
    </div>}
  </SocialPlate>;
}
