import type { LearnsetGuessConfig, LearnsetGuessPlayerState, LearnsetGuessPublicState } from '@pokemon-universe/shared/public';
import { useMemo, useRef } from 'react';
import { ServerTimer } from '../components/ServerTimer';
import { LearnsetAttempts, LearnsetClues, LearnsetHints, LearnsetHud, LearnsetNotices, LearnsetPlate, LearnsetRevealBoard, LearnsetRevealScene, LearnsetScoreboard, LearnsetSearchNote, learnsetOwnLastAttempt, type ScoreLine } from '../games/learnset-guess/LearnsetGuessParts';
import { learnsetAnnouncement, learnsetFocusKey, learnsetLatestStage, learnsetManualExhausted, learnsetPlateKind, learnsetPositions, learnsetVerdict } from '../games/learnset-guess/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { useTimedVisibility } from '../hooks/useTimedVisibility';
import { cx, ScreenSplit } from '../ui';
import { GameSkipSlot } from './GameSkipSlot';
import { useFocusOnTransition } from './focus-transition';
import { learnsetGroupProgress, learnsetLastWarningAnnouncement, learnsetLastWarningText, learnsetManualStakeText, learnsetScoreboard, learnsetSolvedAnnouncement, learnsetStakeText } from './learnset-texts';
import { PokemonSelector } from './PokemonSelector';
import { type ActiveGameProps, ignoreFailure } from './room-command';
import s from '../games/learnset-guess/LearnsetGuess.module.css';

/** Lo que dura en pantalla el aviso «X ha acertado» para los demás. */
const SOLVED_NOTICE_MS = 2_000;

/**
 * Learnset Guess (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda, los avisos (último aviso, quién acaba de
 * acertar) y las pistas de movimientos, la última arriba; en la revelación, la carta del Pokémon y su learnset. Abajo
 * se actúa: el buscador, el acierto con sus puntos o el veredicto. Al lado, el marcador en vivo y los intentos públicos
 * (en la revelación, los puntos de la ronda de cada uno).
 *
 * Revelación manual (`MANUAL_REVEAL`): las pistas y los intentos son los propios (`gamePlayerState`), con «N de M
 * grupos»; no hay cuenta atrás de la siguiente pista (cada fallo enseña un grupo más), solo el tope de la ronda.
 *
 * Privacidad: solo se pinta lo proyectado. La respuesta solo llega en `lastRound`, que el servidor manda únicamente en
 * `ROUND_RESULTS`; aun así la pantalla solo la usa en esa fase.
 */
export function LearnsetGuessGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as LearnsetGuessPublicState;
  const player = room.gamePlayerState as LearnsetGuessPlayerState | null;
  const config = room.selectedGameConfig as Partial<LearnsetGuessConfig> | null;
  const { pokemon, loading: poolLoading, error: poolError, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [] });
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const offset = useServerOffset(room.serverNow);
  const roundRemaining = Math.ceil(useRemainingMs(game.roundEndsAt, offset) / 1_000);
  const transitionRemaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1_000);
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const active = game.phase === 'ROUND_ACTIVE';
  const self = members.get(selfId);
  const participating = self?.role === 'PLAYER';
  const solved = player?.solved === true;
  const canGuess = participating && player?.canGuess === true;
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const manual = game.mode === 'MANUAL_REVEAL';
  const exhausted = manual && participating && learnsetManualExhausted(player);
  // En Revelación manual nunca se usan los grupos públicos: solo los que ha desbloqueado quien mira.
  const groups = manual ? player?.revealedGroups ?? [] : game.visibleGroups;
  const totalGroups = manual ? player?.totalGroups ?? 0 : 0;
  const kind = learnsetPlateKind(game.phase, player ? { canGuess, solved, exhausted } : null, lastRound !== null);
  const latestStage = learnsetLatestStage(groups);
  const latestSolver = game.solvedPlayers.at(-1);
  const latestSolverMember = latestSolver && latestSolver.playerId !== selfId ? members.get(latestSolver.playerId) : undefined;

  // Todos los hooks van antes de elegir la escena: el número de hooks no cambia entre fases.
  const solvedNoticeVisible = useTimedVisibility(SOLVED_NOTICE_MS, `${game.roundNumber}:${game.solvedPlayers.length}`);
  useSfxCue('tick', active && latestStage > 0 ? `${game.roundNumber}:${latestStage}` : null);
  useSfxCue('hit', active && solved ? game.roundNumber : null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(learnsetFocusKey(kind, game.roundNumber), titleRef);

  const lastWarning = active ? learnsetLastWarningText(game.lastWarning, solved || !canGuess, roundRemaining) : null;
  const lastWarningAnnouncement = active ? learnsetLastWarningAnnouncement(game.lastWarning, solved || !canGuess) : null;
  const stake = !active || !canGuess ? null : manual ? learnsetManualStakeText(totalGroups, groups.length) : learnsetStakeText(groups, game.solvedPlayers.length);
  const progress = manual && active && totalGroups > 0 ? learnsetGroupProgress(groups.length, totalGroups) : null;
  const solver = active && solvedNoticeVisible && latestSolverMember ? { key: `${game.roundNumber}:${game.solvedPlayers.length}`, member: latestSolverMember, text: learnsetSolvedAnnouncement(latestSolverMember.displayName) } : null;
  const announcement = learnsetAnnouncement({ kind, game: { ...game, visibleGroups: groups }, roundPoints: player?.roundPoints ?? 0 });
  const attempts = manual ? player?.attempts ?? [] : game.attempts;

  const scoreboard = learnsetScoreboard(room.members, game.scores);
  const positions = learnsetPositions(scoreboard.map((line) => line.points));
  const lines: ScoreLine[] = scoreboard.map(({ member, points }, index) => ({
    member, points, position: positions[index]!, colorIndex: colors.get(member.id) ?? 0,
    solveOrder: game.solvedPlayers.find((entry) => entry.playerId === member.id)?.solveOrder,
    tied: points > 0 && positions.filter((position) => position === positions[index]).length > 1,
  }));

  const last = game.roundNumber >= game.totalRounds;
  const deadline = active ? game.roundEndsAt : game.nextTransitionAt;
  const timer = deadline !== null ? <ServerTimer deadline={deadline} serverOffset={offset} label={active ? 'Tiempo' : last ? 'Clasificación' : 'Siguiente ronda'}
    {...(active && config?.roundSeconds ? { totalMs: config.roundSeconds * 1_000 } : {})} /> : null;
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : '¿Qué Pokémon es?';

  const top = <div className={s.top}>
    <LearnsetHud roundNumber={game.roundNumber} totalRounds={game.totalRounds} referenceGeneration={game.referenceGeneration} referenceSource={game.referenceSource}
      heading={heading} timer={timer} />
    <LearnsetNotices lastWarning={lastWarning} lastWarningAnnouncement={lastWarningAnnouncement} solver={solver} announcement={announcement} />
    {lastRound
      ? <LearnsetRevealScene result={lastRound} />
      : <LearnsetClues groups={groups} latestStage={latestStage} stake={stake} nextClueIn={!manual && active && game.nextTransitionAt ? transitionRemaining : null} progress={progress}
        emptyText={manual && active && totalGroups === 0 ? <span><strong>Cada jugador ve solo sus pistas.</strong> Los movimientos que desbloquea cada uno se descubren en la revelación.</span> : null} />}
    {!lastRound && <LearnsetHints evolutionHint={active ? game.evolutionHint : null} className={s.hints} />}
  </div>;

  const side = <div className={s.sideColumn}>
    {lastRound
      ? <LearnsetRevealBoard result={lastRound} members={room.members} colors={colors} selfId={selfId} className={s.sidePanel} />
      : <>
        <LearnsetScoreboard lines={lines} selfId={selfId} className={s.sidePanel} />
        <LearnsetAttempts attempts={attempts} members={members} colors={colors} className={s.attemptsPanel} own={manual} />
      </>}
    <GameSkipSlot className={s.skip} />
  </div>;

  const search = kind === 'guess' && <div className={s.search}>
    <PokemonSelector key={game.roundNumber} pokemon={pokemon} loading={poolLoading} loadError={poolError} onRetry={retryPool} locked={new Set()} disabled={false}
      confirmationDisabled={cooldownMs > 0} variant="embedded"
      onSelect={(pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }).catch(ignoreFailure)} />
  </div>;

  const bottom = <LearnsetPlate kind={kind} search={search} searchNote={<LearnsetSearchNote cooldownMs={cooldownMs} lastAttempt={learnsetOwnLastAttempt({ attempts }, selfId)} />}
    solveOrder={player?.solveOrder ?? null} roundPoints={player?.roundPoints ?? 0} verdict={lastRound ? learnsetVerdict(lastRound, selfId, participating) : null}
    countdown={`${last ? 'Clasificación' : 'Siguiente ronda'} en ${Math.max(1, transitionRemaining)}s`} titleRef={titleRef} />;

  return <div className={cx('content-row', s.screen)}>
    <ScreenSplit fill top={top} side={side} bottom={bottom} />
  </div>;
}
