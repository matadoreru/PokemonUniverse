import { TYPE_DUEL_MAX_INVALID_COMBINATIONS, type PokemonType, type TypeDuelConfig, type TypeDuelPlayerState, type TypeDuelPublicState } from '@pokemon-universe/shared/public';
import { useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Swords } from 'lucide-react';
import { TypeDuelAttempts, TypeDuelContinue, TypeDuelPickBoard, TypeDuelPlate, TypeDuelResultScene, TypeDuelSearchNote, TypeDuelSidebar, type PickDuelist } from './TypeDuelParts';
import { TypeDuelCoopBoard, TypeDuelCoopContributions, TypeDuelCoopFound, TypeDuelCoopFoundNote, TypeDuelCoopPlate, TypeDuelCoopResultScene, type TypeDuelCoopPlateKind } from './TypeDuelCoopParts';
import { typeDuelAnnouncement, typeDuelCombinationText, typeDuelCoopAnnouncement, typeDuelCoopPhaseLabel, typeDuelCoopRoundTitle, typeDuelFocusKey, typeDuelOwnLastAttempt, typeDuelPhaseLabel, typeDuelPlateKind, typeDuelTimerLabel, typeDuelVerdict } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../../hooks/useServerTime';
import { useSfxCue } from '../../hooks/useSfxCue';
import { Chip, Icon } from '../../ui';
import { GAME_SIDE_FIT, GameScreen, type GameTimer } from '../../room/game-kit/GameScreen';
import { useFocusOnTransition } from '../../room/game-kit/focus-transition';
import { playerColor } from '../../lib/player-color';
import { PokemonSelector } from '../../room/game-kit/PokemonSelector';
import { typeDuelIsLastResult, typeDuelPhaseCue, typeDuelWillRetry } from './type-duel-flow';
import { typeDuelHeading, typeDuelResultText } from './type-duel-result';
import { TypeDuelVersus } from './TypeDuelVersus';
import { type ActiveGameProps, ignoreFailure, sendWithBusy } from '../../room/room-command';
import { useRoomMembers } from '../../room/room-members';
import s from './TypeDuel.module.css';

/** Puntos del ganador de un duelo (regla del motor). */
const WIN_POINTS = 5;

/** Type Duel: el duelo por parejas (Clásico) o la búsqueda de toda la sala (Cooperativo), según `mode`. */
export function TypeDuelGame(props: ActiveGameProps) {
  return (props.room.game as TypeDuelPublicState).mode === 'COOP' ? <TypeDuelCoopGame {...props} /> : <TypeDuelClassicGame {...props} />;
}

/**
 * Type Duel (spec §2 y §6 «Juegos»), en el marco de juego (`GameScreen`). Arriba se mira: la placa de la ronda y la escena de la fase (la elección secreta
 * frente a frente, la losa del VS con los tipos y cuántos Pokémon valen, la combinación imposible o el resultado del
 * duelo). Abajo se actúa: los 18 tipos, el tipo bloqueado, el buscador de la carrera o el resultado con los puntos y la
 * acción del host. Al lado, el marcador y los intentos públicos.
 *
 * Privacidad: solo se pinta lo proyectado. Mientras se elige, del rival solo se sabe si ha bloqueado
 * (`typeSelectionCompletedIds`); los tipos salen cuando el servidor los revela (`revealedTypes`), el propio antes solo
 * desde el estado del jugador (`ownType`).
 */
function TypeDuelClassicGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as TypeDuelPublicState;
  const player = room.gamePlayerState as TypeDuelPlayerState | null;
  const config = room.selectedGameConfig as Partial<TypeDuelConfig> | null;
  const { byId: members, colorIndex: colors, nameOf } = useRoomMembers(room);
  const offset = useServerOffset(room.serverNow);
  const deadline = game.roundEndsAt ?? game.nextTransitionAt;
  const remaining = Math.ceil(useRemainingMs(deadline, offset) / 1000);
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? 0, offset);
  const { pokemon, loading: poolLoading, error: poolError, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: true });
  const [pendingType, setPendingType] = useState<PokemonType | null>(null);
  const [continuing, setContinuing] = useState(false);

  const participant = player?.participant === true;
  const kind = typeDuelPlateKind(game.phase, player);
  const names = game.participants.map(nameOf);
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const resultText = lastRound ? typeDuelResultText(lastRound, game.participants, nameOf) : null;
  const resultTypes = lastRound ? lastRound.requiredTypes ?? Object.values(lastRound.selectedTypes) : [];
  const winningAttempt = lastRound?.attempts.find((attempt) => attempt.correct) ?? null;
  const lastAttempt = typeDuelOwnLastAttempt(game.attempts, selfId);
  const verdict = typeDuelVerdict(lastRound, selfId, participant);
  const wonPoints = lastRound?.winnerId === selfId ? WIN_POINTS : 0;
  const last = typeDuelIsLastResult(game);

  // Tipos revelados con combinación válida: sonido de revelación; el choque disonante, solo sin ningún Pokémon válido.
  const phaseCue = typeDuelPhaseCue(game);
  useSfxCue(phaseCue?.cue ?? null, phaseCue?.key ?? null);
  useSfxCue('win', game.phase === 'ROUND_RESULTS' && game.lastRound?.winnerId === selfId ? game.roundNumber : null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(typeDuelFocusKey(kind, game.roundNumber, game.invalidCombinations), titleRef);

  async function pick(type: PokemonType) {
    if (pendingType || !player?.canSelectType) return;
    await sendWithBusy((busy) => setPendingType(busy ? type : null), () => onAction({ type: 'SELECT_TYPE', pokemonType: type }));
  }
  async function continueNow() {
    if (continuing) return;
    await sendWithBusy(setContinuing, () => onAction({ type: 'CONTINUE' }));
  }

  const totalMs = game.phase === 'SELECTING_TYPES' ? (config?.typeSelectSeconds ?? 15) * 1_000 : game.phase === 'POKEMON_SEARCH' ? (config?.searchSeconds ?? 20) * 1_000 : undefined;
  const timer: GameTimer = { deadline, serverOffset: offset, label: typeDuelTimerLabel(game), totalMs };
  const countdown = game.phase === 'TYPE_REVEAL' ? `La carrera empieza en ${remaining}s.`
    : game.phase === 'INVALID_COMBINATION' ? `Sigue en ${remaining}s.`
      : `${last ? 'Clasificación' : 'Siguiente ronda'} en ${remaining}s`;

  const duelist = (id: string): PickDuelist => ({ id, name: nameOf(id), member: members.get(id), color: playerColor(colors.get(id) ?? 0), locked: game.typeSelectionCompletedIds.includes(id), ownType: id === selfId ? player?.ownType ?? null : null });
  const versusDuelists = [
    { id: game.participants[0], name: names[0]!, type: game.revealedTypes[game.participants[0]], avatar: <Avatar name={names[0]!} avatar={members.get(game.participants[0])?.avatar} size="md" /> },
    { id: game.participants[1], name: names[1]!, type: game.revealedTypes[game.participants[1]], avatar: <Avatar name={names[1]!} avatar={members.get(game.participants[1])?.avatar} size="md" /> },
  ] as const;

  const scene = game.phase === 'SELECTING_TYPES'
    ? <TypeDuelPickBoard duelists={[duelist(game.participants[0]), duelist(game.participants[1])]} selfId={selfId} />
    : game.phase === 'TYPE_REVEAL' || game.phase === 'POKEMON_SEARCH'
      ? <TypeDuelVersus duelists={versusDuelists} requiredTypes={game.requiredTypes} solutionCount={game.solutionCount} />
      : game.phase === 'INVALID_COMBINATION'
        ? <TypeDuelVersus duelists={versusDuelists} requiredTypes={null} solutionCount={null}
          impossible={<p className={s.impossible}>{`No existe ningún Pokémon válido (intento ${game.invalidCombinations} de ${TYPE_DUEL_MAX_INVALID_COMBINATIONS}).`}{typeDuelWillRetry(game) && ' Los mismos jugadores elegirán de nuevo.'}</p>} />
        : lastRound && resultText
          ? <TypeDuelResultScene lastRound={lastRound} title={resultText.title} detail={resultText.detail} types={resultTypes} winningAttempt={winningAttempt} winnerName={lastRound.winnerId ? nameOf(lastRound.winnerId) : null} />
          : null;

  // El marcador mide lo que necesita (solo, no llena la columna); los intentos, debajo, llenan el resto.
  const showAttempts = game.phase === 'POKEMON_SEARCH' || game.phase === 'ROUND_RESULTS';
  const side = <>
    <TypeDuelSidebar game={game} members={members} colors={colors} selfId={selfId} className={GAME_SIDE_FIT} />
    {showAttempts && <TypeDuelAttempts attempts={game.attempts} members={members} colors={colors} />}
  </>;

  const search = kind === 'search' && <div className={s.search}>
    <PokemonSelector key={`${game.roundNumber}-${game.phase}`} pokemon={pokemon} loading={poolLoading} loadError={poolError} onRetry={retryPool} locked={new Set()} disabled={false}
      confirmationDisabled={cooldownMs > 0} variant="embedded" inputLabel="Buscar Pokémon con la combinación exacta"
      onSelect={(pokemonId) => onAction({ type: 'ATTEMPT_POKEMON', pokemonId }).catch(ignoreFailure)} />
  </div>;

  const announcement = typeDuelAnnouncement({ kind, roundNumber: game.roundNumber, ownType: player?.ownType ?? null, requiredTypes: game.requiredTypes, solutionCount: game.solutionCount, lastAttempt, verdict });
  const bottom = <TypeDuelPlate kind={kind} ownType={player?.ownType ?? null} pendingType={pendingType} phase={game.phase} countdown={countdown} verdict={verdict} wonPoints={wonPoints}
    willRetry={typeDuelWillRetry(game)} search={search} searchNote={<TypeDuelSearchNote cooldownMs={cooldownMs} lastAttempt={lastAttempt} />}
    hostAction={selfId === room.hostId ? <TypeDuelContinue last={last} pending={continuing} onContinue={() => void continueNow()} /> : undefined}
    titleRef={titleRef} onPick={(type) => void pick(type)} />;

  return <GameScreen gameName="Type Duel" roundNumber={game.roundNumber} totalRounds={game.totalRounds} phase={game.phase}
    meta={<Chip tone="neutral" icon={<Icon icon={Swords} size={18} />}>{typeDuelPhaseLabel(game.phase)}</Chip>} heading={typeDuelHeading(game.phase, names)}
    timer={timer} announcement={announcement} clue={<div className={s.scene}>{scene}</div>} side={side} bottom={bottom} />;
}

/**
 * Type Duel · Cooperativo (spec «Type Duel · Cooperativo»). Arriba, la placa de la ronda y la combinación con el
 * contador del grupo y la aportación propia (o el resultado de la ronda con los que faltaron). Abajo, el buscador
 * (los ya encontrados quedan bloqueados) o la cuenta atrás con la acción del host. Al lado, la aportación de cada
 * jugador en la partida y, debajo, lo encontrado y quién lo dijo. Un duplicado lo rechaza el servidor con «Ya lo ha
 * encontrado alguien.», que sale en el aviso de la sala (aquí no se repite).
 */
function TypeDuelCoopGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as TypeDuelPublicState;
  const player = room.gamePlayerState as TypeDuelPlayerState | null;
  const config = room.selectedGameConfig as Partial<TypeDuelConfig> | null;
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const offset = useServerOffset(room.serverNow);
  const deadline = game.roundEndsAt ?? game.nextTransitionAt;
  const remaining = Math.ceil(useRemainingMs(deadline, offset) / 1000);
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? 0, offset);
  const { pokemon, loading: poolLoading, error: poolError, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: true });
  const [continuing, setContinuing] = useState(false);

  const combination = game.combination ?? [];
  const found = useMemo(() => game.found ?? [], [game.found]);
  const foundIds = useMemo(() => new Set(found.map((find) => find.pokemonId)), [found]);
  const contributions = game.contributions ?? {};
  const total = game.solutionCount ?? 0;
  const isPlayer = player?.participant === true;
  const ownRound = found.filter((find) => find.playerId === selfId).length;
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const last = typeDuelIsLastResult(game);
  const lastAttempt = typeDuelOwnLastAttempt(game.attempts, selfId);
  const allFound = total > 0 && found.length >= total;
  const kind: TypeDuelCoopPlateKind = game.phase === 'POKEMON_SEARCH' ? (player?.canAttempt ? 'search' : 'watching') : game.phase === 'ROUND_RESULTS' ? 'result' : 'waiting';

  useSfxCue('reveal', game.phase === 'POKEMON_SEARCH' ? `coop:${game.roundNumber}` : null);
  useSfxCue('win', lastRound && allFound ? game.roundNumber : null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(kind === 'result' ? `coop-result-${game.roundNumber}` : null, titleRef);

  async function continueNow() {
    if (continuing) return;
    await sendWithBusy(setContinuing, () => onAction({ type: 'CONTINUE' }));
  }

  const timer: GameTimer = { deadline, serverOffset: offset, label: game.phase === 'POKEMON_SEARCH' ? 'Buscar' : last ? 'Clasificación' : 'Siguiente ronda',
    totalMs: game.phase === 'POKEMON_SEARCH' ? (config?.coopSeconds ?? 60) * 1_000 : undefined };
  const heading = combination.length > 0 ? `Tipo ${typeDuelCombinationText(combination)}` : 'Búsqueda conjunta';
  const scene = lastRound
    ? <TypeDuelCoopResultScene lastRound={lastRound} title={typeDuelCoopRoundTitle(lastRound.reason, found.length, total)} found={found.length} total={total} />
    : combination.length > 0 ? <TypeDuelCoopBoard combination={combination} found={found.length} total={total} ownRound={ownRound} ownTotal={contributions[selfId] ?? 0} /> : null;
  // Como el marcador del Clásico: las aportaciones arriba (miden lo que necesitan) y lo encontrado debajo, que llena el resto.
  const side = <>
    <TypeDuelCoopContributions playerIds={game.playerIds} contributions={contributions} members={members} colors={colors} selfId={selfId} />
    <TypeDuelCoopFound found={found} total={total} members={members} colors={colors} selfId={selfId} />
  </>;

  const search = kind === 'search' && <div className={s.search}>
    <PokemonSelector key={`${game.roundNumber}-${game.phase}`} pokemon={pokemon} loading={poolLoading} loadError={poolError} onRetry={retryPool} locked={foundIds} disabled={false}
      confirmationDisabled={cooldownMs > 0} variant="embedded" inputLabel="Buscar Pokémon con esos tipos"
      onSelect={(pokemonId) => onAction({ type: 'ATTEMPT_POKEMON', pokemonId }).catch(ignoreFailure)} />
  </div>;
  const searchNote = cooldownMs <= 0 && lastAttempt?.correct ? <TypeDuelCoopFoundNote name={lastAttempt.pokemonName} /> : <TypeDuelSearchNote cooldownMs={cooldownMs} lastAttempt={lastAttempt} />;
  const countdown = `${last ? 'Clasificación' : 'Siguiente ronda'} en ${remaining}s`;
  const bottom = <TypeDuelCoopPlate kind={kind} countdown={countdown} search={search} searchNote={searchNote} allFound={allFound} titleRef={titleRef}
    hostAction={selfId === room.hostId ? <TypeDuelContinue last={last} pending={continuing} onContinue={() => void continueNow()} /> : undefined} />;

  const announcement = typeDuelCoopAnnouncement({ phase: game.phase, roundNumber: game.roundNumber, combination, found: found.length, total, lastAttempt, player: isPlayer });
  return <GameScreen gameName="Type Duel" roundNumber={game.roundNumber} totalRounds={game.totalRounds} phase={game.phase}
    meta={<Chip tone="neutral" icon={<Icon icon={Swords} size={18} />}>{typeDuelCoopPhaseLabel(game.phase)}</Chip>} heading={heading}
    timer={timer} announcement={announcement} clue={<div className={s.scene}>{scene}</div>} side={side} bottom={bottom} />;
}
