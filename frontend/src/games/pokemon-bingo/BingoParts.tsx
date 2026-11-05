import type { BingoPublicBoard, PokemonBingoPublicState, RoomMemberView } from '@pokemon-universe/shared/public';
import { CheckCircle2, Eye, Grid3x3, Plus, Trophy } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { guessSprite } from '../../room/guess-kit';
import { playerColor } from '../../room/player-color';
import { Badge, Card, Chip, cx, Icon, Panel, Row } from '../../ui';
import { bingoCellLabel, bingoPlayerOrder, bingoProgressText } from './presentation';
import s from './PokemonBingo.module.css';

const offline = (member: RoomMemberView | undefined) => member?.presence !== undefined && member.presence !== 'CONNECTED';

/**
 * Tablero de Bingo: una rejilla de `width` columnas con una `Card` por casilla. Cada carta dice su condición en texto y,
 * el Pokémon colocado (su sprite ocupa casi toda la casilla, con el nombre y el tic de «Completa») o «Vacía». Con `onSelect`, las cartas son conmutadores
 * (`aria-pressed`) para elegir la casilla; sin él (rivales, resultados), cartas quietas. `fill` reparte el alto libre
 * entre las filas (el tablero propio en escritorio); si no caben, el `Panel` que lo contiene se desplaza por dentro.
 * `showSolutions` solo en los resultados: el servidor manda `possibleSolutions` al terminar la partida.
 */
export function BingoBoard({ board, width, height, selectedCellId = null, onSelect, showSolutions = false, fill = false, label }: {
  board: BingoPublicBoard;
  width: number;
  height: number;
  selectedCellId?: string | null;
  onSelect?: ((cellId: string) => void) | undefined;
  showSolutions?: boolean;
  fill?: boolean;
  label: string;
}) {
  return <div className={cx(s.grid, fill && s.gridFill, width >= 4 && s.many, height >= 4 && s.dense)} style={{ '--cols': width, '--rows': height } as CSSProperties} role="group" aria-label={label} data-testid="bingo-board">
    {board.cells.map((cell, index) => {
      const condition = bingoCellLabel(cell);
      const assigned = cell.assignment;
      const selected = cell.id === selectedCellId;
      const solutions = showSolutions ? cell.possibleSolutions : [];
      return <Card key={cell.id} size="fill" name={condition} decorativeSprite state={selected ? 'selected' : 'idle'}
        {...(assigned ? { sprite: guessSprite(assigned.sprite) } : { art: <Icon icon={Plus} size={24} /> })}
        attrs={{
          'data-bingo-cell': cell.id,
          'data-filled': assigned ? 'true' : 'false',
          ...(onSelect ? { 'aria-label': `Casilla ${index + 1}: ${condition}. ${assigned ? `${assigned.name}, completa` : 'Vacía'}` } : {}),
        }}
        {...(onSelect ? { onSelect: () => onSelect(cell.id) } : {})}>
        {assigned
          ? <>
            <span className={s.filled}>
              <strong className={s.assigned} title={assigned.name}>{assigned.name}</strong>
              <span className="sr-only">Completa</span>
            </span>
            {/* «Completa» a la vista: el tic de la esquina (el sprite ocupa la casilla; el texto, para lectores). */}
            <span className={s.done} aria-hidden="true"><Icon icon={CheckCircle2} size={18} /></span>
          </>
          : <span className={s.empty}>Vacía</span>}
        {solutions.length > 0 && <span className={s.solutions}>
          <span className={s.solutionsTitle}>Podías usar</span>
          <span className={s.solutionList}>{solutions.map((pokemon) => <span key={pokemon.id} className={s.solution}>
            <img src={guessSprite(pokemon.sprite)} alt="" loading="lazy" decoding="async" />
            <span title={pokemon.name}>{pokemon.name}</span>
          </span>)}</span>
        </span>}
      </Card>;
    })}
  </div>;
}

/**
 * Placa del tablero (pantalla superior): el tamaño del tablero, tu progreso y tus puntos de la sesión, el título y, a la
 * derecha, el plazo (en el bingo, el de la clasificación).
 */
export function BingoHud({ width, height, heading, progress, points, timer }: {
  width: number;
  height: number;
  heading: string;
  progress: BingoPublicBoard | null;
  points: number | null;
  timer: ReactNode;
}) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Tablero {width}×{height}</Badge>
        {progress && <span data-testid="bingo-progress"><Chip tone={progress.completed === progress.total ? 'ok' : 'neutral'} icon={<Icon icon={Grid3x3} size={18} />}>Tu progreso · {progress.completed}/{progress.total}</Chip></span>}
        {points !== null && <span className={s.hudPoints}><Chip tone="neutral" icon={<Icon icon={Trophy} size={18} />}>{points} pts</Chip></span>}
      </div>
      <h1 className={cx(s.heading, 'ol')} title={heading}>{heading}</h1>
    </div>
    <div className={s.hudTimer}>{timer}</div>
  </Panel>;
}

/**
 * Los jugadores en la columna lateral: una franja por tablero con su puesto, color, avatar, «Sin conexión» y su
 * progreso en texto. La de cada rival (y, para quien observa, la de todos) es un botón que abre su tablero completo:
 * lo que ya proyecta el servidor (sus casillas y lo que ha colocado).
 */
export function BingoPlayers({ game, members, colors, selfId, onOpen, className }: {
  game: PokemonBingoPublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  colors: ReadonlyMap<string, number>;
  selfId: string;
  onOpen(playerId: string): void;
  className?: string | undefined;
}) {
  const ids = bingoPlayerOrder(game.boards, [...members.keys()], game.winnerId);
  return <Panel title="Tableros" variant="dark" scroll scrollLabel="Progreso de cada jugador" className={cx(className)}
    right={<Badge tone="cream">{`${ids.length} ${ids.length === 1 ? 'jugador' : 'jugadores'}`}</Badge>}>
    <ol className={s.rows} aria-label="Progreso de cada jugador">{ids.map((id, index) => {
      const board = game.boards[id]!;
      const member = members.get(id);
      const name = member?.displayName ?? 'Entrenador';
      const self = id === selfId;
      const winner = id === game.winnerId;
      const row = <Row rank={index + 1} name={self ? `${name} (tú)` : name} color={playerColor(colors.get(id) ?? 0)} self={self} highlight={winner} disconnected={offline(member)}
        avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
        meta={<span className={s.rowMeta}>
          {winner ? <Chip tone="ok" icon={<Icon icon={Trophy} size={18} />}>¡Bingo!</Chip> : <span className={s.rowProgress}>{bingoProgressText(board)}</span>}
        </span>}
        value={<span className={s.rowValue}>{board.completed}<small>/{board.total}</small></span>}>
        {!self && <span className={s.open} aria-hidden="true"><Icon icon={Eye} size={18} />Ver</span>}
      </Row>;
      return <li key={id} data-testid="bingo-player-row" aria-current={self ? 'true' : undefined}>
        {self ? row : <button type="button" className={s.rowButton} aria-label={`Ver tablero de ${name}: ${bingoProgressText(board)}${winner ? ', ¡bingo!' : ''}`} onClick={() => onOpen(id)}>{row}</button>}
      </li>;
    })}</ol>
  </Panel>;
}
