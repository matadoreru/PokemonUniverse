import type { ConnectionAnswerGroup, ConnectionPokemon, PokemonConnectionsPublicState, PokemonConnectionsRoundResult, RoomMemberView } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Puzzle, Users, XCircle } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { apiAsset } from '../../lib/api';
import { playerColor } from '../../room/player-color';
import { sharesPosition } from '../../room/results-ties';
import { Badge, Card, Chip, cx, Icon, Panel, Row } from '../../ui';
import { higherLowerRanking } from '../higher-lower/presentation';
import { connectionsRevealOrder, connectionsRoundLine, connectionsStatusLabels, connectionsStatusTone } from './presentation';
import s from './PokemonConnections.module.css';

/**
 * Placa del puzle (pantalla superior): el puzle y su forma, el título y, a la derecha, el plazo (al revelar, el del avance
 * automático en el mismo hueco).
 */
export function ConnectionsHud({ roundNumber, totalRounds, groupCount, groupSize, heading, source, timer }: {
  roundNumber: number;
  totalRounds: number;
  groupCount: number;
  groupSize: number;
  heading: string;
  /** Al revelar: de dónde sale el puzle. */
  source?: PokemonConnectionsRoundResult['source'] | null;
  timer: ReactNode;
}) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Puzle {roundNumber} de {totalRounds}</Badge>
        <span className={s.shape}><Chip tone="neutral" icon={<Icon icon={Puzzle} size={18} />}>{groupCount} grupos de {groupSize}</Chip></span>
        {source && <Chip tone="info">Solución {source === 'CURATED' ? 'curada' : 'generada'}</Chip>}
      </div>
      <h1 className={cx(s.heading, 'ol')} title={heading}>{heading}</h1>
    </div>
    <div className={s.hudTimer}>{timer}</div>
  </Panel>;
}

/** Sprites del catálogo: las rutas de la API se sirven desde su origen; las URL absolutas, tal cual. */
const spriteUrl = (sprite: string) => sprite.startsWith('/api/') ? apiAsset(sprite) : sprite;

/**
 * Banda de un grupo: su tema en texto, la explicación y sus Pokémon. Ocupa una fila entera de la rejilla. Con `status`,
 * dice además si lo encontraste («Encontrada» / «No encontrada»); con `foundBy`, cuántos lo encontraron.
 */
export function ConnectionsBand({ group, index, status, foundBy }: {
  group: ConnectionAnswerGroup;
  /** Orden del grupo (tono de la banda). */
  index: number;
  status?: 'found' | 'missed' | null;
  foundBy?: string | null;
}) {
  return <li className={cx(s.band, s[`band${index % 5}`], status === 'missed' && s.bandMissed)} data-connection-group={group.id}>
    <div className={s.bandText}>
      <span className={s.bandMeta}>
        {status === 'found' && <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Encontrada</Chip>}
        {status === 'missed' && <Chip tone="bad" icon={<Icon icon={XCircle} size={18} />}>No encontrada</Chip>}
        {foundBy && <span className={s.foundBy}><Icon icon={Users} size={18} />{foundBy}</span>}
      </span>
      <strong className={s.bandLabel} title={group.label}>{group.label}</strong>
      <span className={s.bandExplanation} title={group.explanation}>{group.explanation}</span>
    </div>
    <ul className={s.bandPokemon} aria-label={`Pokémon de «${group.label}»`}>{group.pokemon.map((pokemon) => <li key={pokemon.id}>
      <img src={spriteUrl(pokemon.sprite)} alt="" loading="lazy" decoding="async" />
      <span title={pokemon.name}>{pokemon.name}</span>
    </li>)}</ul>
  </li>;
}

/**
 * Tablero: una rejilla de `groupSize` columnas y `groupCount` filas. Arriba, una banda por grupo encontrado (fila
 * entera); debajo, las cartas que quedan (`Card` llenas). Con `onToggle`, cada carta es un conmutador (`aria-pressed`)
 * que se usa con el teclado (Tab y Espacio o Intro); sin él (espectador, sin intentos), son cartas quietas.
 */
export function ConnectionsBoard({ groupSize, groupCount, bands, cards, selected, onToggle, label }: {
  groupSize: number;
  groupCount: number;
  bands: ReactNode[];
  cards: readonly ConnectionPokemon[];
  selected: readonly string[];
  onToggle?: ((id: string) => void) | undefined;
  label: string;
}) {
  return <div className={s.grid} style={{ '--cols': groupSize, '--rows': groupCount } as CSSProperties} data-testid="connections-grid" role="group" aria-label={label}>
    {bands.length > 0 && <ol className={s.bands} style={{ gridRow: `span ${bands.length}` }} aria-label="Grupos">{bands}</ol>}
    {cards.map((pokemon) => {
      const active = selected.includes(pokemon.id);
      return <Card key={pokemon.id} size="fill" sprite={spriteUrl(pokemon.sprite)} name={pokemon.name} decorativeSprite state={active ? 'selected' : 'idle'}
        attrs={{ 'data-connection-card': pokemon.id }} {...(onToggle ? { onSelect: () => onToggle(pokemon.id) } : {})} />;
    })}
  </div>;
}

/**
 * Progreso del grupo (columna lateral, en la ronda): un `Row` por jugador por puntos, con su color, el estado en texto y
 * cuántos grupos lleva (nunca cuáles: son privados hasta revelar).
 */
export function ConnectionsProgress({ game, members, colors, selfId, className }: {
  game: PokemonConnectionsPublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  className?: string | undefined;
}) {
  const playerIds = Object.keys(game.playerProgress);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';
  const ranking = higherLowerRanking({ playerIds, scores: game.scores }, nameOf);
  const done = playerIds.filter((id) => game.playerProgress[id]?.status === 'SOLVED').length;
  const points = (id: string) => game.scores[id] ?? 0;
  return <Panel title="Progreso" variant="dark" scroll scrollLabel="Progreso del grupo" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${done} / ${playerIds.length} completados`}</Badge>}>
    <p className={s.sideHint}>Cada uno resuelve su tablero: los grupos de los demás son privados hasta revelar.</p>
    <ol className={s.rows} aria-label="Progreso de los jugadores">{ranking.map(({ id, position }) => {
      const member = members.get(id);
      const progress = game.playerProgress[id]!;
      const name = nameOf(id);
      return <li key={id} aria-current={id === selfId ? 'true' : undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>
            <Chip tone={connectionsStatusTone(progress.status)}>{connectionsStatusLabels[progress.status]}</Chip>
            <span key={progress.foundGroups} className={cx(s.groups, progress.foundGroups > 0 && 'motion-bump')} data-found={id}>{progress.foundGroups}/{game.groupCount} grupos</span>
            {sharesPosition(ranking, id, points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
          </span>}
          value={<span className={s.score}>{points(id)}<small> pts</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}

/** Clasificación de la ronda (columna lateral, al revelar): quién completó y en qué puesto, sus grupos, tiempo, errores y puntos. */
export function ConnectionsRoundBoard({ result, groupCount, members, colors, selfId, className }: {
  result: PokemonConnectionsRoundResult;
  groupCount: number;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  className?: string | undefined;
}) {
  const ordered = connectionsRevealOrder(result.players);
  const solved = ordered.filter(([, player]) => player.status === 'SOLVED').length;
  return <Panel title="Esta ronda" variant="dark" scroll scrollLabel="Clasificación de la ronda" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${solved} / ${ordered.length} completados`}</Badge>}>
    <ol className={s.rows} aria-label="Resultado de la ronda">{ordered.map(([id, player]) => {
      const member = members.get(id);
      const name = member?.displayName ?? 'Entrenador';
      return <li key={id} aria-current={id === selfId ? 'true' : undefined} data-testid="connections-round-row">
        <Row {...(player.completionRank ? { rank: player.completionRank } : {})} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId}
          disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'} avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>
            <Chip tone={connectionsStatusTone(player.status)}>{player.status === 'SOLVED' && player.completionRank ? `Completó · ${player.completionRank}.º` : connectionsStatusLabels[player.status]}</Chip>
            <span className={s.roundLine}>{connectionsRoundLine(player, groupCount)}</span>
          </span>}
          value={<span className={s.score}>+{player.pointsAwarded}</span>} />
      </li>;
    })}</ol>
  </Panel>;
}
