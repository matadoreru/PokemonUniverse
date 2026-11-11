import type { GuessFromStatsConfig, GuessFromStatsPlayerState, GuessFromStatsPokemonReveal, GuessFromStatsPublicState, GuessFromStatsVisibleStat } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';
import type { CSSProperties } from 'react';
import { describeStatsHint, fullStats, statLabels, statMax, statsAnswerText } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { Bar, cx, TypeBadge } from '../../ui';
import {
  GuessAttemptsFeed, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal,
  guessPublicAttempts, guessRevealLines, guessScoreboard, guessSolvedOrders, useGuessRound,
} from '../../room/guess-kit';
import { GamePanel, GameScreen } from '../../room/game-kit/GameScreen';
import type { ActiveGameProps } from '../../room/room-command';
import s from './Stats.module.css';

const GAME_NAME = 'Guess from Stats';
const QUESTION = '¿De quién son estas estadísticas?';
const SCORING = 'Vale cualquier Pokémon con las mismas estadísticas; cuanto antes aciertes, más puntos.';

/**
 * Estadísticas base, una por fila: el nombre y el número en texto y una `Bar` decorativa (escala fija: 255 por
 * estadística y 780 para el total). En la pista escalan con el sitio libre; en la ficha de la revelación van pequeñas.
 */
export function StatRows({ stats, label = 'Estadísticas base', compact = false }: { stats: readonly GuessFromStatsVisibleStat[]; label?: string; /** Ficha de la revelación: barras finas. */ compact?: boolean }) {
  return <ul className={s.stats} aria-label={label} data-testid="stat-rows" style={{ '--rows': stats.length, '--rows2': Math.ceil(stats.length / 2) } as CSSProperties}>
    {stats.map((stat) => <li key={stat.key} className={cx(s.row, stat.key === 'bst' && s.total)} data-testid="stat-row">
      <span className={s.label}>{statLabels[stat.key]}</span>
      <span className={s.bar}><Bar value={stat.value} max={statMax(stat.key)} tone={stat.key === 'bst' ? 'info' : 'yellow'} label={statLabels[stat.key]} size={compact ? 'md' : 'lg'} decorative /></span>
      <strong className={s.value}>{stat.value}</strong>
    </li>)}
  </ul>;
}

/** Ficha completa de una respuesta en la revelación: sus tipos y sus siete estadísticas. */
function AnswerSheet({ pokemon, big = false }: { pokemon: GuessFromStatsPokemonReveal; /** Una sola respuesta: a ≥1600 crece con la losa. */ big?: boolean }) {
  return <div className={cx(s.sheet, big && s.big)}>
    <span className={s.types}>{pokemon.types.map((type) => <TypeBadge key={type} type={type} label={POKEMON_TYPE_LABELS[type]} size="sm" />)}</span>
    <StatRows stats={fullStats(pokemon)} label={`Estadísticas de ${pokemon.name}`} compact />
  </div>;
}

/**
 * Guess from Stats con el kit de adivinar (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda, las
 * estadísticas (barras con nombre y número en texto, llenan el sitio libre) y las pistas adicionales; en la revelación,
 * la carta de cada respuesta válida con su ficha completa. Abajo se actúa: el buscador, el acierto con sus puntos o el
 * veredicto. Al lado, el marcador y los intentos (o los puntos de la ronda, con lo que eligió cada uno).
 *
 * Privacidad: las estadísticas no dicen el nombre; las respuestas solo llegan en `lastRound`, que el servidor manda al
 * revelar, y la pantalla solo las usa en `ROUND_RESULTS`.
 */
export function GuessFromStatsGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as GuessFromStatsPublicState;
  const player = room.gamePlayerState as GuessFromStatsPlayerState | null;
  const config = room.selectedGameConfig as Partial<GuessFromStatsConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: true });
  const round = useGuessRound({ room, selfId, game, player, answer: (result) => statsAnswerText(result.answers.map((answer) => answer.name)), roundSeconds: config?.roundSeconds });
  const { members, colors, active, lastRound, announcement, timer } = round;
  const several = (lastRound?.answers.length ?? 0) > 1;
  const heading = lastRound ? several ? `¡Valían ${lastRound.answers.length} Pokémon!` : `¡Era ${lastRound.answers[0]?.name ?? ''}!` : 'Reconoce sus stats';

  const clue = lastRound
    ? <GuessRoundReveal answers={lastRound.answers.map((answer) => ({ id: answer.id, name: answer.name, sprite: answer.sprite, detail: <AnswerSheet pokemon={answer} big={!several} /> }))}
      details={several ? <>Todas coinciden exactamente con lo que se mostró.</> : <>Generación {lastRound.answers[0]?.generation}</>} className={s.scene} />
    : <GamePanel label="Estadísticas del Pokémon misterioso" className={s.stage}>
      <StatRows stats={game.visibleStats} />
    </GamePanel>;

  const hints = active && game.hints.length > 0
    ? <GuessHints hints={game.hints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describeStatsHint(hint) }))} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? `Eligió ${solve.submittedPokemon.name}` : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solvedPlayers))} selfId={selfId} />
      {guessPublicAttempts(config) && <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />}
    </>;

  const bottom = <GuessPanel {...round.panel} question={QUESTION} guessText={SCORING} gameName={GAME_NAME}
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;

  return <GameScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
