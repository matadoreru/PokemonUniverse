import type { PokemonPaletteGuessConfig, PokemonPaletteGuessPlayerState, PokemonPaletteGuessPublicState, RoomView } from '@pokemon-universe/shared/public';
import { useMemo, useRef, type CSSProperties } from 'react';
import { describePaletteHint, paletteSwatches } from '../games/pokemon-palette-guess/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { cx } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import {
  GuessAttemptsFeed, GuessClue, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal, GuessScreen,
  guessAnnouncement, guessFocusKey, guessOwnLastAttempt, guessPanelKind, guessRevealLines, guessScoreboard, guessSolvedOrders, guessVerdict,
} from './guess-kit';
import s from '../games/pokemon-palette-guess/Palette.module.css';

const GAME_NAME = 'Adivina por la Paleta';
const QUESTION = '¿De quién son estos colores?';
const SCORING = 'Cuanto antes aciertes, más puntos; el primero suma un extra.';

/**
 * La paleta: una barra con una franja por color (tan ancha como su peso aproximado) y, debajo, la leyenda con el nombre
 * y el porcentaje de cada color en texto, en el mismo orden (en escritorio, en dos filas como mucho). La barra es una imagen con un nombre que lo dice todo.
 * Es la pista, no la respuesta: los colores no identifican al Pokémon por sí solos.
 */
export function PaletteClue({ colors, weights, className }: { colors: readonly string[]; weights: readonly number[]; className?: string | undefined }) {
  const swatches = paletteSwatches(colors, weights);
  const summary = swatches.map((swatch) => `${swatch.name}, aproximadamente ${swatch.percent}%`).join('; ');
  return <div className={cx(s.palette, className)}>
    <div className={s.bar} role="img" aria-label={`Paleta de ${colors.length} colores con peso aproximado: ${summary}`}>
      {swatches.map((swatch, index) => <span key={`${swatch.color}-${index}`} className={s.segment} style={{ backgroundColor: swatch.color, flexGrow: swatch.weight || 1 }} title={`${swatch.name}, aproximadamente ${swatch.percent}%`} />)}
    </div>
    <ol className={s.legend} aria-label="Colores de la paleta" data-testid="palette-legend" style={{ '--cols': Math.min(4, Math.ceil(swatches.length / 2)) } as CSSProperties}>
      {swatches.map((swatch, index) => <li key={`${swatch.color}-${index}`} className={s.item}>
        <span className={s.swatch} style={{ backgroundColor: swatch.color }} aria-hidden="true" />
        <span className={s.name} title={swatch.name}>{swatch.name}</span>
        <span className={s.percent}>{swatch.percent}%</span>
      </li>)}
    </ol>
  </div>;
}

/**
 * Adivina por la Paleta con el kit de adivinar (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda, la
 * paleta (barra y leyenda en texto, escalan con el sitio libre) y las pistas adicionales; en la revelación, la carta del
 * Pokémon con su paleta al lado. Abajo se actúa: el buscador, el acierto con sus puntos o el veredicto. Al lado, el
 * marcador y los intentos (o los puntos de la ronda).
 *
 * Privacidad: la respuesta (nombre y sprite) solo llega en `lastRound`, que el servidor manda al revelar; aun así la
 * pantalla solo la usa en `ROUND_RESULTS`.
 */
export function PokemonPaletteGuessGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as PokemonPaletteGuessPublicState;
  const player = room.gamePlayerState as PokemonPaletteGuessPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonPaletteGuessConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [] });
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const offset = useServerOffset(room.serverNow);
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const transitionRemaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1_000);
  const active = game.phase === 'ROUND_ACTIVE';
  // El espectador viene en el estado del jugador (`player.role`), no en el rol del miembro.
  const participating = player?.role === 'PLAYER';
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const kind = guessPanelKind(game.phase, player ? { participating, canGuess: player.canGuess, solved: player.solved } : null, lastRound !== null);
  const ownLast = active ? guessOwnLastAttempt(game.attempts, selfId) : null;

  // Todos los hooks van antes de elegir la escena: el número de hooks no cambia entre fases.
  useSfxCue('hit', active && player?.solved ? game.roundNumber : null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(guessFocusKey(kind, game.roundNumber), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : 'Reconoce sus colores';
  const announcement = guessAnnouncement({ kind, roundNumber: game.roundNumber, answer: lastRound?.pokemon.name ?? null, solveOrder: player?.solveOrder ?? null, roundPoints: player?.roundPoints ?? 0, lastWrong: ownLast?.guessedPokemon.name ?? null, attemptCount: player?.attemptCount ?? 0 });

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.pokemon.sprite }]} details={<>Generación {lastRound.pokemon.generation}</>}
      clueTitle="Su paleta" clue={<PaletteClue className={s.reveal} colors={lastRound.palette} weights={lastRound.paletteWeights} />} />
    : <GuessClue label={`Paleta de ${game.colors.length} colores dominantes`} className={s.stage}>
      <PaletteClue colors={game.colors} weights={game.colorWeights} />
    </GuessClue>;

  const hints = active && game.hints.length > 0
    ? <GuessHints hints={game.hints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describePaletteHint(hint) }))} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? `Rapidez ${solve.speedPoints} + orden ${solve.placementBonus}` : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solvedPlayers))} selfId={selfId} />
      <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />
    </>;

  const bottom = <GuessPanel kind={kind} titleRef={titleRef} question={QUESTION} guessText={SCORING} gameName={GAME_NAME} solvedTitle="¡Paleta acertada!"
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la paleta ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }}
    cooldownMs={cooldownMs} lastWrong={ownLast?.guessedPokemon.name ?? null} attemptCount={player?.attemptCount ?? 0}
    solveOrder={player?.solveOrder ?? null} roundPoints={player?.roundPoints ?? 0}
    verdict={lastRound ? guessVerdict(lastRound.solves, selfId, participating) : null} countdown={`${last ? 'Clasificación' : 'Siguiente ronda'} en ${Math.max(1, transitionRemaining)}s`} />;

  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  return <GuessScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
