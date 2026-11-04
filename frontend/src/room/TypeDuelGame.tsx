import { TYPE_DUEL_MAX_INVALID_COMBINATIONS, type PokemonType, type RoomView, type TypeDuelConfig, type TypeDuelPlayerState, type TypeDuelPublicState } from '@pokemon-universe/shared/public';
import { useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { ServerTimer } from '../components/ServerTimer';
import { TypeDuelAttempts, TypeDuelContinue, TypeDuelHud, TypeDuelPickBoard, TypeDuelPlate, TypeDuelResultScene, TypeDuelSearchNote, TypeDuelSidebar, type PickDuelist } from '../games/type-duel/TypeDuelParts';
import { typeDuelAnnouncement, typeDuelFocusKey, typeDuelOwnLastAttempt, typeDuelPhaseLabel, typeDuelPlateKind, typeDuelTimerLabel, typeDuelVerdict } from '../games/type-duel/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { cx, ScreenSplit } from '../ui';
import { GameSkipSlot } from './GameSkipSlot';
import { useFocusOnTransition } from './focus-transition';
import { playerColor } from './player-color';
import { PokemonSelector } from './PokemonSelector';
import { typeDuelIsLastResult, typeDuelWillRetry } from './type-duel-flow';
import { typeDuelHeading, typeDuelResultText } from './type-duel-result';
import { TypeDuelVersus } from './TypeDuelVersus';
import s from '../games/type-duel/TypeDuel.module.css';

/** El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí no se repite. */
const ignoreFailure = () => undefined;

/** Puntos del ganador de un duelo (regla del motor). */
const WIN_POINTS = 5;

/**
 * Type Duel (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda y la escena de la fase (la elección secreta
 * frente a frente, la losa del VS con los tipos y cuántos Pokémon valen, la combinación imposible o el resultado del
 * duelo). Abajo se actúa: los 18 tipos, el tipo bloqueado, el buscador de la carrera o el resultado con los puntos y la
 * acción del host. Al lado, el marcador y los intentos públicos.
 *
 * Privacidad: solo se pinta lo proyectado. Mientras se elige, del rival solo se sabe si ha bloqueado
 * (`typeSelectionCompletedIds`); los tipos salen cuando el servidor los revela (`revealedTypes`), el propio antes solo
 * desde el estado del jugador (`ownType`).
 */
export function TypeDuelGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as TypeDuelPublicState;
  const player = room.gamePlayerState as TypeDuelPlayerState | null;
  const config = room.selectedGameConfig as Partial<TypeDuelConfig> | null;
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? id;
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

  // El choque suena al revelarse los tipos (también tras reintentar una combinación imposible: entre medias la clave es null).
  useSfxCue('clang', game.phase === 'TYPE_REVEAL' ? game.roundNumber : null);
  useSfxCue('win', game.phase === 'ROUND_RESULTS' && game.lastRound?.winnerId === selfId ? game.roundNumber : null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(typeDuelFocusKey(kind, game.roundNumber, game.invalidCombinations), titleRef);

  async function pick(type: PokemonType) {
    if (pendingType || !player?.canSelectType) return;
    setPendingType(type);
    try { await onAction({ type: 'SELECT_TYPE', pokemonType: type }).catch(ignoreFailure); } finally { setPendingType(null); }
  }
  async function continueNow() {
    if (continuing) return;
    setContinuing(true);
    try { await onAction({ type: 'CONTINUE' }).catch(ignoreFailure); } finally { setContinuing(false); }
  }

  const totalMs = game.phase === 'SELECTING_TYPES' ? (config?.typeSelectSeconds ?? 15) * 1_000 : game.phase === 'POKEMON_SEARCH' ? (config?.searchSeconds ?? 20) * 1_000 : undefined;
  const timer = deadline !== null ? <ServerTimer deadline={deadline} serverOffset={offset} label={typeDuelTimerLabel(game)} {...(totalMs ? { totalMs } : {})} /> : null;
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

  const top = <div className={s.top}>
    <TypeDuelHud roundNumber={game.roundNumber} totalRounds={game.totalRounds} phaseLabel={typeDuelPhaseLabel(game.phase)} heading={typeDuelHeading(game.phase, names)} timer={timer} />
    {scene}
  </div>;

  const showAttempts = game.phase === 'POKEMON_SEARCH' || game.phase === 'ROUND_RESULTS';
  const side = <div className={s.sideColumn}>
    <TypeDuelSidebar game={game} members={members} colors={colors} selfId={selfId} className={s.sidePanel} />
    {showAttempts && <TypeDuelAttempts attempts={game.attempts} members={members} colors={colors} className={s.attemptsPanel} />}
    <GameSkipSlot className={s.skip} />
  </div>;

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

  return <div className={cx('content-row', s.screen)}>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </div>;
}
