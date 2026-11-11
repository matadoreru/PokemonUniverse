import type { ZoomedPokemonConfig, ZoomedPokemonPlayerState, ZoomedPokemonPublicState } from '@pokemon-universe/shared/public';
import { ZoomOut } from 'lucide-react';
import { describeZoomedHint, zoomedSourceLabel, zoomLabel } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { Chip, cx, Icon } from '../../ui';
import {
  GuessAttemptsFeed, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal,
  guessPublicAttempts, guessRevealLines, guessScoreboard, guessSolvedOrders, useGuessRound,
} from '../../room/guess-kit';
import { GamePanel, GameScreen } from '../../room/game-kit/GameScreen';
import type { ActiveGameProps } from '../../room/room-command';
import s from './Zoomed.module.css';

const GAME_NAME = 'Zoomed Pokémon';
const QUESTION = '¿Qué Pokémon es?';
const SCORING = 'Cuanto antes aciertes, más zoom queda y más bonificación sumas.';

/**
 * Visor del recorte ampliado: una imagen opaca sin nombre (`role="img"` con `alt` genérico). El servidor sirve un
 * recorte por etapa (`stage-N`, ya ampliado y centrado en un punto con relieve); aquí solo se pinta, suave al crecer.
 */
export function ZoomViewport({ source, sourceType, alt, className }: { source: string; sourceType: 'SPRITE' | 'ARTWORK'; alt: string; className?: string | undefined }) {
  return <span role="img" aria-label={alt} className={cx(s.viewport, className)} data-source-type={sourceType}>
    {source && <img src={source} alt="" />}
  </span>;
}

/**
 * Zoomed Pokémon con el kit de adivinar (spec §2 y §6 «Juegos»). Arriba se mira: la placa de la ronda con el zoom y su
 * bonificación, el recorte ampliado (escala con el sitio libre; la cámara se aleja a cada cuarto de la ronda) y las
 * pistas adicionales; en la revelación, la carta del Pokémon con el recorte con el que empezó. Abajo se actúa: el
 * buscador, el acierto con sus puntos o el veredicto. Al lado, el marcador y los intentos (o los puntos de la ronda).
 *
 * Privacidad: el recorte es una imagen opaca sin nombre. La respuesta (nombre e imagen completa) solo llega en
 * `lastRound`, que el servidor manda al revelar; aun así la pantalla solo la usa en `ROUND_RESULTS`.
 */
export function ZoomedPokemonGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as ZoomedPokemonPublicState;
  const player = room.gamePlayerState as ZoomedPokemonPlayerState | null;
  const config = room.selectedGameConfig as Partial<ZoomedPokemonConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeForms ?? false });
  const round = useGuessRound({ room, selfId, game, player, answer: (result) => result.pokemon.name, roundSeconds: config?.roundSeconds });
  const { members, colors, active, lastRound, transitionRemaining, announcement, timer } = round;
  const stages = game.zoomStages.length;
  const zoom = game.zoomStages[game.currentZoomStage] ?? game.zoomStages[0] ?? 1;
  const firstZoom = game.zoomStages[0] ?? zoom;
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : QUESTION;

  const meta = active ? <>
    <Chip tone="info">Zoom {zoomLabel(zoom)}</Chip>
    <Chip tone="warn">Nivel {game.currentZoomStage + 1} de {stages} · bonificación +{game.currentZoomBonus}</Chip>
  </> : null;

  const nextZoom = game.nextTransitionAt
    ? <Chip tone="neutral" icon={<Icon icon={ZoomOut} size={18} />}>Menos zoom en {Math.max(1, transitionRemaining)}s</Chip>
    : <Chip tone="neutral" icon={<Icon icon={ZoomOut} size={18} />}>Último nivel de zoom</Chip>;

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.imageUrl }]} details={<>Generación {lastRound.pokemon.generation} · {zoomedSourceLabel(lastRound.imageSourceType)}</>}
      clueTitle={`Así empezó · Zoom ${zoomLabel(firstZoom)}`} clue={<ZoomViewport className={s.revealCrop} source={lastRound.initialCropUrl} sourceType={lastRound.imageSourceType} alt={`Recorte inicial, zoom ${zoomLabel(firstZoom)}`} />} />
    : <GamePanel label="Recorte ampliado del Pokémon misterioso" variant="dark" className={s.stage}>
      <ZoomViewport source={game.imageUrl ?? ''} sourceType={game.imageSourceType ?? 'SPRITE'} alt="Detalle ampliado del Pokémon misterioso" />
      {active && <span className={s.next}>{nextZoom}</span>}
    </GamePanel>;

  const hints = active && game.visibleHints.length > 0
    ? <GuessHints hints={game.visibleHints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describeZoomedHint(hint) }))} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? `Zoom ${zoomLabel(solve.zoom)} · +${solve.zoomBonus} extra` : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solves))} selfId={selfId} />
      {guessPublicAttempts(config) && <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />}
    </>;

  const bottom = <GuessPanel {...round.panel} question={QUESTION} guessText={SCORING} gameName={GAME_NAME}
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;

  return <GameScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} meta={meta} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
