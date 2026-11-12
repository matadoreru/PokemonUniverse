import type { BingoPublicCell, PokemonBingoConfig, PokemonBingoPlayerState, PokemonBingoPublicState } from '@pokemon-universe/shared/public';
import { ArrowRight, CheckCircle2, Clock3, Eye, Grid3x3, Hourglass, Lock, Trash2, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BingoBoard, BingoPlayers } from './BingoParts';
import { bingoAnnouncement, bingoAttemptText, bingoCellLabel, bingoFocusKey, bingoMoveText, bingoPlateKind, bingoProgressText, type BingoPlateKind } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { useOutcomeCue } from '../../room/game-kit/useOutcomeCue';
import { Chip, ConfirmDialog, MomentCutin, cx, Dialog, Icon, Panel, Pill, ScoreValue } from '../../ui';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { GAME_SIDE_FIT, GameScreen, type GameTimer } from '../../room/game-kit/GameScreen';
import { GuessPanel, guessSeconds, type GuessPlateContent } from '../../room/guess-kit';
import { type ActiveGameProps, ignoreFailure, sendWithBusy } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './PokemonBingo.module.css';

/** Mover un Pokémon que ya está en otra casilla: espera la confirmación del `Dialog`. */
interface PendingMove { pokemonId: string; pokemonName: string; from: BingoPublicCell; to: BingoPublicCell }

/**
 * Pokémon Bingo (spec §2 y §6 «Juegos»), en el marco de juego (`GameScreen`). Arriba se mira: la placa del tablero con el plazo y el tablero propio, una
 * rejilla de `Card`s (condición, Pokémon colocado o vacía) que se eligen con `aria-pressed`. Abajo se actúa: la casilla
 * elegida con «Quitar Pokémon» y, al lado (debajo en el móvil), el buscador. Al lado, los tableros de todos: el de cada
 * rival se abre en un `Dialog`. Mover un Pokémon ya colocado se confirma en otro `Dialog`.
 *
 * Al cantar bingo (`ROUND_RESULTS`, 8 s): un `Cutin` «¡BINGO!» con el ganador y, en la placa, quién ganó, la cuenta
 * atrás de la clasificación y, para el host, «Saltar y continuar».
 */
export function PokemonBingoGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonBingoPublicState;
  const player = room.gamePlayerState as PokemonBingoPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonBingoConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const { pokemon, error: poolError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [] });
  const { byId: members, colorIndex: colors, nameOf } = useRoomMembers(room);

  const own = game.boards[selfId] ?? null;
  const kind = bingoPlateKind(game.phase, { hasBoard: own !== null, canAct: player?.canAct ?? false });
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [rivalId, setRivalId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [skipping, setSkipping] = useState(false);
  // Fuera de la ronda no se puede mover nada: la confirmación pendiente se cierra.
  useEffect(() => { if (kind !== 'pick') setPending(null); }, [kind]);

  // Por defecto, la primera casilla (también si la elegida ya no está en el tablero).
  const chosen = own?.cells.findIndex((cell) => cell.id === selectedCellId) ?? -1;
  const selectedIndex = own ? chosen >= 0 ? chosen : own.cells.length > 0 ? 0 : -1 : -1;
  const selectedCell = own && selectedIndex >= 0 ? own.cells[selectedIndex]! : null;
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const attempt = kind === 'pick' ? player?.lastAttempt ?? null : null;
  useOutcomeCue(attempt?.correct, attempt?.attemptedAt);
  // Último acierto: el buscador se vuelve a montar vacío (la bandeja abierta quitaría sitio al tablero).
  const [placedAt, setPlacedAt] = useState<number | null>(attempt?.correct ? attempt.attemptedAt : null);
  if (attempt?.correct && attempt.attemptedAt !== placedAt) setPlacedAt(attempt.attemptedAt);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(bingoFocusKey(kind, placedAt), titleRef);

  async function assign(pokemonId: string) {
    if (kind !== 'pick' || !own || !selectedCell) return;
    const from = own.cells.find((cell) => cell.assignment?.id === pokemonId && cell.id !== selectedCell.id);
    if (from) {
      setPending({ pokemonId, pokemonName: from.assignment!.name, from, to: selectedCell });
      return;
    }
    await onAction({ type: 'ASSIGN_POKEMON', cellId: selectedCell.id, pokemonId, moveExisting: false }).catch(ignoreFailure);
  }
  function confirmMove(move: PendingMove) {
    void onAction({ type: 'ASSIGN_POKEMON', cellId: move.to.id, pokemonId: move.pokemonId, moveExisting: true }).catch(ignoreFailure);
  }
  function remove() {
    if (!selectedCell?.assignment) return;
    void onAction({ type: 'REMOVE_POKEMON', cellId: selectedCell.id }).catch(ignoreFailure);
  }
  async function skip() {
    await sendWithBusy(setSkipping, () => onAction({ type: 'SKIP_RESULTS' }));
  }

  // Quien no tiene tablero (espectador) ve en grande el del que va primero; todos se abren desde el lateral.
  const shownId = own ? selfId : Object.keys(game.boards)[0] ?? null;
  const shown = shownId ? game.boards[shownId] ?? null : null;
  const winnerName = game.winnerId ? nameOf(game.winnerId) : null;
  const remaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1000);
  const durationMs = Math.max(1, (config?.durationSeconds ?? 120) * 1_000);
  // En el bingo, el plazo de la clasificación en el mismo hueco.
  const timer: GameTimer = game.phase === 'ROUND_ACTIVE'
    ? { deadline: game.roundEndsAt, serverOffset: offset, totalMs: durationMs, label: 'Tiempo' }
    : { deadline: game.phase === 'ROUND_RESULTS' ? game.nextTransitionAt : null, serverOffset: offset, label: 'Clasificación' };
  const heading = kind === 'bingo' ? '¡BINGO!' : own ? 'Completa tu tablero' : 'Tableros en directo';
  const points = members.get(selfId)?.sessionPoints ?? null;

  // Tu progreso y tus puntos de la sesión, junto al tamaño del tablero.
  const meta = own && <>
    <span data-testid="bingo-progress"><Chip tone={own.completed === own.total ? 'ok' : 'neutral'} icon={<Icon icon={Grid3x3} size={18} />}>Tu progreso · {own.completed}/{own.total}</Chip></span>
    {points !== null && <span className={s.hudPoints}><Chip tone="neutral" icon={<Icon icon={Trophy} size={18} />}><ScoreValue value={points} self> pts</ScoreValue></Chip></span>}
  </>;

  const board = shown && <Panel variant="cream" scroll scrollLabel={own ? 'Tu tablero' : `Tablero de ${nameOf(shown.playerId)}`} className={cx(s.boardPanel)} bodyClassName={cx(s.boardBody)}
      title={own ? 'Tu tablero' : `Tablero de ${nameOf(shown.playerId)}`} right={<Chip tone={shown.completed === shown.total ? 'ok' : 'neutral'}>{bingoProgressText(shown)}</Chip>}>
      <BingoBoard board={shown} width={game.width} height={game.height} fill selectedCellId={kind === 'pick' ? selectedCell?.id ?? null : null}
        onSelect={kind === 'pick' ? setSelectedCellId : undefined} label={own ? 'Tu tablero: elige una casilla' : `Tablero de ${nameOf(shown.playerId)}`} />
    </Panel>;

  const side = <BingoPlayers game={game} members={members} colors={colors} selfId={selfId} onOpen={setRivalId} className={GAME_SIDE_FIT} />;

  const content = plateContent({
    kind, cell: selectedCell, index: selectedIndex, total: own?.total ?? 0, cooldownMs, attempt, winnerName, selfWon: game.winnerId === selfId,
    host: room.hostId === selfId, remaining, skipping, onRemove: remove, onSkip: () => void skip(),
  });
  const bottom = <GuessPanel kind={kind === 'pick' && selectedCell ? 'guess' : 'waiting'} titleRef={titleRef} question="" content={content} cooldownMs={cooldownMs}
    selector={{ pokemon, loading: poolLoading, loadError: poolError, onRetry: retryPool, inputLabel: `Buscar Pokémon para la casilla ${selectedIndex + 1}`, roundKey: `bingo-${placedAt ?? 0}`, onGuess: assign }} />;

  const rival = rivalId ? game.boards[rivalId] ?? null : null;
  const rivalDialog = <Dialog open={rival !== null} title={`Tablero de ${rivalId ? nameOf(rivalId) : ''}`} width={1200} onClose={() => setRivalId(null)} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined }]}>
    {rival && <>
      <p className={s.dialogMeta}>
        <Chip tone={rival.completed === rival.total ? 'ok' : 'neutral'} icon={<Icon icon={Grid3x3} size={18} />}>{bingoProgressText(rival)}</Chip>
        {rival.playerId === game.winnerId && <Chip tone="ok" icon={<Icon icon={Trophy} size={18} />}>¡Bingo!</Chip>}
      </p>
      <BingoBoard board={rival} width={game.width} height={game.height} label={`Tablero de ${nameOf(rival.playerId)}`} />
    </>}
  </Dialog>;

  const move = pending ? bingoMoveText({ pokemonName: pending.pokemonName, from: pending.from, to: pending.to }) : null;
  const moveDialog = <ConfirmDialog open={pending !== null} title={move?.title ?? ''} onClose={() => setPending(null)} width={520}
    confirmLabel="Mover aquí" tone="yellow" focus="confirm" onConfirm={() => { if (pending) confirmMove(pending); }}>
    {move && <div className={s.moveText}><p>{move.used}</p><p><strong>{move.question}</strong></p></div>}
  </ConfirmDialog>;

  const announcement = bingoAnnouncement({ kind, attempt, cooldownMs, winner: winnerName ? { name: winnerName, self: game.winnerId === selfId } : null });
  return <>
    {rivalDialog}
    {moveDialog}
    {/* Sin región viva propia: el bingo lo dice la región de la pantalla. */}
    {kind === 'bingo' && winnerName && <MomentCutin key={game.bingoAt ?? 0} tone="yellow" title="¡BINGO!" confetti={game.winnerId === selfId} subtitle={game.winnerId === selfId ? '¡Has completado tu tablero!' : `${winnerName} ha completado el tablero`} />}
    {/* Sin rondas: la insignia dice el tamaño del tablero y la pista entra de nuevo solo al cambiar de fase. */}
    <GameScreen gameName="Pokémon Bingo" roundNumber={1} totalRounds={1} phase={game.phase} roundLabel={`Tablero ${game.width}×${game.height}`} meta={meta} heading={heading}
      timer={timer} announcement={announcement} clue={board} side={side} bottom={bottom} testId="pokemon-bingo-screen" />
  </>;
}

function plateContent({ kind, cell, index, total, cooldownMs, attempt, winnerName, selfWon, host, remaining, skipping, onRemove, onSkip }: {
  kind: BingoPlateKind;
  cell: BingoPublicCell | null;
  index: number;
  total: number;
  cooldownMs: number;
  attempt: PokemonBingoPlayerState['lastAttempt'];
  winnerName: string | null;
  selfWon: boolean;
  host: boolean;
  remaining: number;
  skipping: boolean;
  onRemove(): void;
  onSkip(): void;
}): GuessPlateContent {
  switch (kind) {
    case 'pick': {
      if (!cell) return { icon: Clock3, tone: 'info', kicker: 'Pokémon Bingo', title: 'Preparando el tablero…', text: 'El servidor prepara las casillas.' };
      // La espera se ve (oculta a los lectores: ya lo dijo la región viva); si no, lo que dijo el último intento.
      const note = cooldownMs > 0
        ? <span aria-hidden="true" data-testid="bingo-cooldown"><Chip tone="warn" icon={<Icon icon={Hourglass} size={18} />}>Espera {guessSeconds(cooldownMs)} · puedes cambiar de casilla</Chip></span>
        : attempt
          ? <span data-testid="bingo-feedback"><Chip tone={attempt.correct ? 'ok' : 'bad'} icon={<Icon icon={attempt.correct ? CheckCircle2 : X} size={18} />}>{bingoAttemptText(attempt.message)}</Chip></span>
          : null;
      return {
        icon: Grid3x3, tone: cell.assignment ? 'ok' : 'warn', kicker: `Casilla seleccionada · ${index + 1} de ${total}`, title: bingoCellLabel(cell),
        text: cell.assignment ? 'Elige otro Pokémon para cambiarlo o quítalo.' : 'Vacía: busca un Pokémon que cumpla la condición.',
        ...(note || cell.assignment ? {
          aside: <span className={s.plateNotes}>
            {note}
            {/* A la vista a cualquier tamaño (la ayuda de la placa se oculta en el móvil y en el escritorio bajo). */}
            {cell.assignment && <span className={s.current}>Actualmente: <strong>{cell.assignment.name}</strong></span>}
            {cell.assignment && <Pill variant="ghost" size="small" icon={Trash2} onClick={onRemove}>Quitar Pokémon</Pill>}
          </span>,
        } : {}),
      };
    }
    case 'blocked': return { icon: Lock, tone: 'bad', kicker: 'Tu tablero', title: 'No puedes colocar Pokémon', text: 'Ahora no puedes modificar tu tablero: sigue a la vista, con los de los demás.' };
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'Espectador', title: 'Estás observando', text: 'Los tableros de todos se actualizan en directo: ábrelos desde «Tableros».' };
    case 'bingo': return {
      icon: Trophy, tone: 'ok', kicker: '¡BINGO!', title: selfWon ? '¡Has completado tu tablero!' : `${winnerName ?? 'Alguien'} ha completado el tablero`,
      text: `La clasificación aparecerá en ${Math.max(0, remaining)}s.${host ? '' : ' El host puede continuar antes.'}`,
      ...(host ? { aside: <span className={s.bingoAside}><Pill variant="yellow" icon={ArrowRight} loading={skipping} onClick={onSkip}>Saltar y continuar</Pill></span> } : {}),
    };
    default: return { icon: Clock3, tone: 'info', kicker: 'Pokémon Bingo', title: 'Preparando el tablero…', text: 'El servidor prepara las casillas.' };
  }
}
