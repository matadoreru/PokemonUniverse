import { whoPokemonScoringLabel, type RoomView, type WhosThatPokemonConfig, type WhosThatPokemonPlayerState, type WhosThatPokemonPublicState } from '@pokemon-universe/shared/public';
import { Lightbulb } from 'lucide-react';
import { describeWhosThatHint } from '../games/whos-that-pokemon/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { Chip, Icon } from '../ui';
import {
  GuessAttemptsFeed, GuessClue, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal, GuessScreen,
  guessRevealLines, guessScoreboard, guessSolvedOrders, guessSprite, useGuessRound,
} from './guess-kit';
import s from '../games/whos-that-pokemon/WhosThat.module.css';

const GAME_NAME = '¿Quién es ese Pokémon?';

/**
 * ¿Quién es ese Pokémon? con el kit de adivinar (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda, la
 * silueta (escala con el sitio libre) y las pistas adicionales; en la revelación, la carta del Pokémon con su silueta al
 * lado. Abajo se actúa: el buscador, el acierto con sus puntos o el veredicto. Al lado, el marcador en vivo y los
 * intentos públicos (en la revelación, los puntos de la ronda de cada uno).
 *
 * Privacidad: la silueta es una imagen opaca sin nombre (`alt` genérico). La respuesta solo llega en `lastRound`, que
 * el servidor manda en `ROUND_RESULTS`; aun así la pantalla solo la usa en esa fase.
 */
export function WhosThatPokemonGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as WhosThatPokemonPublicState;
  const player = room.gamePlayerState as WhosThatPokemonPlayerState | null;
  const config = room.selectedGameConfig as Partial<WhosThatPokemonConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeRegionalForms ?? false });
  const round = useGuessRound({ room, selfId, game, player, answer: (result) => result.pokemon.name, roundSeconds: config?.roundSeconds });
  const { members, colors, active, lastRound, transitionRemaining, announcement, timer } = round;
  const solved = guessSolvedOrders(game.solvedPlayers);
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : 'Reconoce su silueta';

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.pokemon.sprite }]} details={<>Generación {lastRound.pokemon.generation} · {whoPokemonScoringLabel()}</>}
      clueTitle="Así era su silueta" clue={<span className={s.revealShadow}><img src={guessSprite(lastRound.pokemon.sprite)} alt="" /></span>} />
    : <GuessClue label="Silueta misteriosa normalizada" className={s.stage}>
      <span className={s.mark} aria-hidden="true">?</span>
      {game.silhouetteSprite && <img className={s.silhouette} src={game.silhouetteSprite} alt="Silueta de un Pokémon misterioso" />}
    </GuessClue>;

  const hints = active && config?.hintsEnabled
    ? <GuessHints hints={game.visibleHints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describeWhosThatHint(hint) }))} emptyText="La primera pista aparecerá durante la ronda."
      next={game.nextTransitionAt ? <Chip tone="neutral" icon={<Icon icon={Lightbulb} size={18} />}>Siguiente pista en {Math.max(1, transitionRemaining)}s</Chip> : null} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? `Rapidez ${solve.speedPoints} + orden ${solve.placementBonus}` : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, solved)} selfId={selfId} />
      <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />
    </>;

  const bottom = <GuessPanel {...round.panel} question={GAME_NAME} guessText={whoPokemonScoringLabel()} gameName={GAME_NAME}
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;

  return <GuessScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
