import type { PokemonType, RoomMemberView, TypeDuelCoopFind, TypeDuelRoundResult } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3, Eye, Search, Target, Trophy, Users } from 'lucide-react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { Avatar } from '../../components/Avatar';
import { playerColor } from '../../room/player-color';
import { Badge, Card, Chip, cx, Icon, Panel, Row, TypeBadge } from '../../ui';
import { typeDuelCoopRanking, typeLabel } from './presentation';
import { typeDuelSprite } from './TypeDuelParts';
import { UNKNOWN_PLAYER_NAME } from '../../room/room-members';
import s from './TypeDuel.module.css';

/**
 * Cooperativo (pantalla superior, durante la búsqueda): la combinación de la ronda, el contador del grupo y la aportación
 * propia. `data-testid="type-duel-coop-board"`.
 */
export function TypeDuelCoopBoard({ combination, found, total, ownRound, ownTotal }: { combination: readonly PokemonType[]; found: number; total: number; ownRound: number; ownTotal: number }) {
  return <section className={s.coopBoard} aria-labelledby="type-duel-coop-title" data-testid="type-duel-coop-board">
    <h2 id="type-duel-coop-title" className={s.kickerLight}>Buscad juntos Pokémon de tipo</h2>
    <span className={s.coopTypes}>{combination.map((type, index) => <TypeBadge key={`${type}-${index}`} type={type} label={typeLabel(type)} size="lg" />)}</span>
    <div className={s.coopCounters}>
      <p className={s.coopCounter}><strong className={s.solutions}>{found} de {total}</strong><span>encontrados por el grupo</span></p>
      <p className={s.coopCounter}><strong className={s.solutions}>{ownRound}</strong><span>{`${ownRound === 1 ? 'tuyo' : 'tuyos'} esta ronda · ${ownTotal} en la partida`}</span></p>
    </div>
  </section>;
}

/**
 * Cooperativo (pantalla superior, en el resultado de la ronda): cuántos encontró el grupo, la combinación y los que
 * nadie dijo. `data-testid="type-duel-coop-result"`.
 */
export function TypeDuelCoopResultScene({ lastRound, title, found, total }: { lastRound: TypeDuelRoundResult; title: string; found: number; total: number }) {
  const all = total > 0 && found >= total;
  const missed = lastRound.solutions;
  const types = lastRound.requiredTypes ?? [];
  return <Panel variant="cream" as="section" aria-labelledby="type-duel-result-title" className={cx(s.resultPanel)} bodyClassName={cx(s.result)}>
    <div className={s.resultMain} data-testid="type-duel-coop-result">
      <span className={cx(s.resultIcon, all ? s.tone_ok : s.tone_info)}><Icon icon={all ? Trophy : Clock3} size={32} /></span>
      <div className={s.resultText}>
        <span className={s.kicker}>Resultado del grupo</span>
        <h2 id="type-duel-result-title" className={s.resultTitle}>{title}</h2>
        <p className={s.help}>{`${found} de ${total} Pokémon con esta combinación.`}</p>
        {types.length > 0 && <span className={s.resultTypes}>{types.map((type, index) => <TypeBadge key={`${type}-${index}`} type={type} label={typeLabel(type)} />)}</span>}
      </div>
    </div>
    {missed.length > 0 && <div className={s.solutionsBlock}>
      <h3 className={s.kicker}>{total - found > missed.length ? `Os faltaron ${total - found}; entre ellos` : 'Os faltaron'}</h3>
      <ul className={s.solutionGrid} style={{ '--count': missed.length } as CSSProperties}>
        {missed.map((solution) => <li key={solution.id}><Card size="sm" sprite={typeDuelSprite(solution.sprite)} name={solution.name} decorativeSprite /></li>)}
      </ul>
    </div>}
  </Panel>;
}

/** Cooperativo (columna lateral): lo encontrado en la ronda y quién lo dijo primero; el último arriba. */
export function TypeDuelCoopFound({ found, total, members, colors, selfId, className }: { found: readonly TypeDuelCoopFind[]; total: number; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const ordered = [...found].reverse();
  return <Panel title="Encontrados" variant="dark" scroll scrollLabel="Pokémon encontrados por el grupo" {...(className ? { className } : {})} right={<Badge tone="cream">{`${found.length} de ${total}`}</Badge>}>
    {/* Vacío sin región viva propia (la pantalla ya tiene la suya): enseña a jugar. */}
    {found.length === 0 && <p className={s.empty}><Icon icon={Search} size={24} /><span><strong>Todavía no hay ninguno.</strong> Cada Pokémon con esos tipos suma una vez para el grupo.</span></p>}
    {ordered.length > 0 && <ul className={s.rows} aria-label="Pokémon encontrados">{ordered.map((find) => {
      const name = members.get(find.playerId)?.displayName ?? UNKNOWN_PLAYER_NAME;
      return <li key={find.pokemonId}>
        <Row name={find.pokemonName} color={playerColor(colors.get(find.playerId) ?? 0)}
          avatar={<img className={s.attemptSprite} src={typeDuelSprite(find.sprite)} alt="" />}
          meta={<span className={s.rowMeta}><span className={s.attemptBy}>{find.playerId === selfId ? 'Lo encontraste tú' : `Lo encontró ${name}`}</span></span>} />
      </li>;
    })}</ul>}
  </Panel>;
}

/** Cooperativo (columna lateral): la aportación de cada jugador en la partida, de más a menos. */
export function TypeDuelCoopContributions({ playerIds, contributions, members, colors, selfId, className }: { playerIds: readonly string[]; contributions: Readonly<Record<string, number>>; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const nameOf = (id: string) => members.get(id)?.displayName ?? UNKNOWN_PLAYER_NAME;
  const ranking = typeDuelCoopRanking(playerIds, contributions, nameOf);
  const total = ranking.reduce((sum, entry) => sum + entry.count, 0);
  return <Panel title="Aportaciones" variant="dark" scroll scrollLabel="Aportación de cada jugador" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${total} en total`}</Badge>}>
    <ol className={s.rows} aria-label="Aportación de cada jugador en la partida">{ranking.map(({ id, count, position }) => {
      const member = members.get(id);
      const name = nameOf(id);
      return <li key={id} aria-current={id === selfId ? 'true' : undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          value={<span className={s.score}>{count}<small> Pokémon</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}

export type TypeDuelCoopPlateKind = 'search' | 'watching' | 'result' | 'waiting';

interface CoopPlateContent { icon: LucideIcon; tone: 'ok' | 'info' | 'warn'; kicker: string; title: ReactNode; text?: ReactNode; aside?: ReactNode }

/**
 * Cooperativo (pantalla inferior): el buscador durante la ronda, observar (quien no juega la partida) o el resultado con
 * la cuenta atrás y la acción del host. El título admite foco por programa.
 */
export function TypeDuelCoopPlate({ kind, countdown, search, searchNote, hostAction, allFound, titleRef }: { kind: TypeDuelCoopPlateKind; countdown: string; search?: ReactNode; searchNote?: ReactNode; hostAction?: ReactNode; allFound: boolean; titleRef: Ref<HTMLHeadingElement> }) {
  const content: CoopPlateContent = kind === 'search'
    ? { icon: Target, tone: 'info', kicker: 'Búsqueda conjunta', title: 'Nombra Pokémon con esos tipos', aside: searchNote }
    : kind === 'watching'
      ? { icon: Eye, tone: 'info', kicker: 'Observas la partida', title: 'El grupo está buscando', text: 'Los hallazgos aparecen en directo.' }
      : kind === 'result'
        ? { icon: allFound ? CheckCircle2 : Users, tone: allFound ? 'ok' : 'info', kicker: 'Ronda terminada', title: countdown, aside: hostAction && <span className={s.resultAside}>{hostAction}</span> }
        : { icon: Clock3, tone: 'info', kicker: 'Type Duel', title: 'Preparando la búsqueda…', text: 'El servidor sortea la combinación.' };
  return <Panel variant="cream" as="section" bodyClassName={cx(s.plate, kind === 'search' && s.plateWide, kind === 'search' && s.plateSearch)} aria-labelledby="type-duel-plate-title">
    <div className={s.plateRow}>
      <span className={cx(s.plateIcon, s[`tone_${content.tone}`])}><Icon icon={content.icon} size={32} /></span>
      <div className={s.plateText}>
        <span className={s.kicker}>{content.kicker}</span>
        <h2 id="type-duel-plate-title" ref={titleRef} tabIndex={-1} className={s.plateTitle}>{content.title}</h2>
        {content.text && <p className={s.help}>{content.text}</p>}
      </div>
      {content.aside && <div className={s.plateAside}>{content.aside}</div>}
    </div>
    {kind === 'search' && search}
  </Panel>;
}

/** Chip bajo el título de la búsqueda tras encontrar uno propio (los fallos y la espera los da `TypeDuelSearchNote`). */
export function TypeDuelCoopFoundNote({ name }: { name: string }) {
  return <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}><span className={s.noteName}>{name}</span> suma</Chip>;
}
