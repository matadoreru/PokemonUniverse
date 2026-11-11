import { speedPodiumScoringText, type PokemonPaletteGuessConfig, type PokemonPaletteGuessPlayerState, type PokemonPaletteGuessPublicState } from '@pokemon-universe/shared/public';
import type { CSSProperties } from 'react';
import { describePaletteHint, paletteSwatches } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { cx } from '../../ui';
import { GamePanel, GameScreen } from '../../room/game-kit/GameScreen';
import {
  GuessAttemptsFeed, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal,
  guessPublicAttempts, guessRevealLines, guessScoreboard, guessSolvedOrders, useGuessRound,
  GuessStreakChip, speedPodiumSolveDetail,
} from '../../room/guess-kit';
import type { ActiveGameProps } from '../../room/room-command';
import s from './Palette.module.css';

const GAME_NAME = 'Adivina por la Paleta';
const QUESTION = '¿De quién son estos colores?';

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
export function PokemonPaletteGuessGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonPaletteGuessPublicState;
  const player = room.gamePlayerState as PokemonPaletteGuessPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonPaletteGuessConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [] });
  const round = useGuessRound({ room, selfId, game, player, participating: player?.role === 'PLAYER', answer: (result) => result.pokemon.name, roundSeconds: config?.roundSeconds });
  const { members, colors, active, lastRound, announcement, timer } = round;
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : 'Reconoce sus colores';

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.pokemon.sprite }]} details={<>Generación {lastRound.pokemon.generation}</>}
      clueTitle="Su paleta" clue={<PaletteClue className={s.reveal} colors={lastRound.palette} weights={lastRound.paletteWeights} />} />
    : <GamePanel label={`Paleta de ${game.colors.length} colores dominantes`} className={s.stage}>
      <PaletteClue colors={game.colors} weights={game.colorWeights} />
    </GamePanel>;

  const hints = active && game.hints.length > 0
    ? <GuessHints hints={game.hints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describePaletteHint(hint) }))} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? speedPodiumSolveDetail(solve) : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solvedPlayers))} selfId={selfId} />
      {guessPublicAttempts(config) && <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />}
    </>;

  const bottom = <GuessPanel {...round.panel} question={QUESTION} guessText={speedPodiumScoringText(config?.streakBonus)} gameName={GAME_NAME} solvedTitle="¡Paleta acertada!"
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la paleta ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;

  return <GameScreen gameName={GAME_NAME} roundNumber={game.roundNumber} phase={game.phase} totalRounds={game.totalRounds} heading={heading} timer={timer} meta={<GuessStreakChip streak={player?.streak} />}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
