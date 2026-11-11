import type { RoomMemberView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Check, Hourglass, LockKeyhole } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge, Chip, cx, Icon, Panel, Row, type ChipProps } from '../../ui';
import { playerColor } from '../../lib/player-color';
import s from './SocialSide.module.css';

/** Estado de un jugador en el progreso, en texto (el color del chip nunca va solo). */
export interface ProgressStatus {
  tone: NonNullable<ChipProps['tone']>;
  text: string;
  icon?: LucideIcon;
}

export interface ResponseProgressProps {
  /** Miembros de la sala (`room.members`): nombre, avatar, conexión y, por su orden, el color del jugador. */
  members: readonly RoomMemberView[];
  /** Jugadores de la partida, en el orden en que salen (sin espectadores). */
  playerIds: readonly string[];
  /** Quién ya ha respondido o votado (solo el hecho, nunca el qué). */
  doneIds: readonly string[];
  selfId: string;
  title?: string;
  /** Texto de quien ya ha terminado («Respondió», «Votó», «Lista»). */
  doneText?: string;
  /** Texto de quien falta («Pendiente»). */
  pendingText?: string;
  /** Nota bajo la lista (p. ej. qué sigue siendo secreto hasta la revelación). */
  note?: ReactNode;
  /** Estado propio de un jugador en lugar de hecho/pendiente (p. ej. «Ganó», «Sin respuesta», «Describe»); `null`: el de siempre. */
  status?: (playerId: string) => ProgressStatus | null;
  /** Valor a la derecha de la franja (p. ej. los puntos de la ronda, «+3»). */
  value?: (playerId: string) => ReactNode;
  /** Insignia de la cabecera: «N/M» terminados (por defecto) o nada (`false`). */
  count?: boolean;
  className?: string | undefined;
}

const offline = (member: RoomMemberView | undefined) => member?.presence !== undefined && member.presence !== 'CONNECTED';

/**
 * Progreso del grupo (columna lateral): una franja por jugador con su color, avatar y, en texto, «Respondió»/«Votó» o
 * «Pendiente»; los desconectados lo dicen en su franja («Sin conexión»). Solo dice quién ha terminado, nunca qué ha
 * elegido o votado. Con `status` y `value` sirve también para la revelación («Ganó», «Sin respuesta», «+3»).
 */
export function ResponseProgress({ members, playerIds, doneIds, selfId, title = 'Estado del grupo', doneText = 'Respondió', pendingText = 'Pendiente', note, status, value, count = true, className }: ResponseProgressProps) {
  const byId = useMemo(() => new Map(members.map((member, index) => [member.id, { member, index }])), [members]);
  const done = new Set(doneIds);
  const finished = playerIds.filter((id) => done.has(id)).length;
  return <Panel title={title} variant="dark" scroll scrollLabel={title} {...(className ? { className } : {})} right={count ? <Badge tone="cream">{`${finished}/${playerIds.length}`}</Badge> : undefined}>
    <ol className={s.rows} aria-label={title}>{playerIds.map((playerId) => {
      const entry = byId.get(playerId);
      const name = entry?.member.displayName ?? 'Entrenador';
      const own = status?.(playerId) ?? (done.has(playerId) ? { tone: 'ok' as const, text: doneText, icon: Check } : { tone: 'neutral' as const, text: pendingText, icon: Hourglass });
      const right = value?.(playerId);
      return <li key={playerId} data-testid="social-progress-row" aria-current={playerId === selfId ? 'true' : undefined}>
        <Row name={name} color={playerColor(entry?.index ?? 0)} self={playerId === selfId} disconnected={offline(entry?.member)}
          avatar={<Avatar name={name} avatar={entry?.member.avatar} level={entry?.member.level} size="sm" />}
          meta={<span className={s.rowMeta}><Chip tone={own.tone} {...(own.icon ? { icon: <Icon icon={own.icon} size={18} /> } : {})}>{own.text}</Chip></span>}
          {...(right != null ? { value: <span className={s.value}>{right}</span> } : {})} />
      </li>;
    })}</ol>
    {note && <p className={cx(s.note)}><Icon icon={LockKeyhole} size={18} />{note}</p>}
  </Panel>;
}
