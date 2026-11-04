import type { RoomView, ZoomedPokemonConfig, ZoomedPokemonPlayerState, ZoomedPokemonPublicState } from '@pokemon-universe/shared/public';
import { ZoomOut } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { describeZoomedHint, zoomedSourceLabel, zoomLabel } from '../games/zoomed-pokemon/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Chip, cx, Icon } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import {
  GuessAttemptsFeed, GuessClue, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal, GuessScreen,
  guessAnnouncement, guessFocusKey, guessOwnLastAttempt, guessPanelKind, guessRevealLines, guessScoreboard, guessSolvedOrders, guessVerdict,
} from './guess-kit';
import s from '../games/zoomed-pokemon/Zoomed.module.css';

const GAME_NAME = 'Zoomed Pokémon';
const QUESTION = '¿Qué Pokémon es?';
const SCORING = 'Cuanto antes aciertes, más zoom queda y más bonificación sumas.';

/**
 * Visor del recorte ampliado: una imagen opaca sin nombre (`role="img"` con `alt` genérico). El servidor sirve un
 * recorte por etapa (`stage-N`, ya ampliado y centrado en un punto con relieve); aquí solo se pinta, suave al crecer.
 */
export function ZoomViewport({ source, sourceType, alt, className }: { source: string; sourceType: 'SPRITE' | 'ARTWORK'; zoom: number; alt: string; className?: string | undefined }) {
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
export function ZoomedPokemonGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as ZoomedPokemonPublicState;
  const player = room.gamePlayerState as ZoomedPokemonPlayerState | null;
  const config = room.selectedGameConfig as Partial<ZoomedPokemonConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeForms ?? false });
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const colors = useMemo(() => new Map(room.members.map((member, index) => [member.id, index])), [room.members]);
  const offset = useServerOffset(room.serverNow);
  const cooldownMs = useRemainingMs(player?.cooldownUntil ?? null, offset);
  const transitionRemaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1_000);
  const active = game.phase === 'ROUND_ACTIVE';
  const participating = members.get(selfId)?.role === 'PLAYER';
  const lastRound = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const kind = guessPanelKind(game.phase, player ? { participating, canGuess: player.canGuess, solved: player.solved } : null, lastRound !== null);
  const ownLast = active ? guessOwnLastAttempt(game.attempts, selfId) : null;

  // Todos los hooks van antes de elegir la escena: el número de hooks no cambia entre fases.
  useSfxCue('hit', active && player?.solved ? game.roundNumber : null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(guessFocusKey(kind, game.roundNumber), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const stages = game.zoomStages.length;
  const zoom = game.zoomStages[game.currentZoomStage] ?? game.zoomStages[0] ?? 1;
  const firstZoom = game.zoomStages[0] ?? zoom;
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : QUESTION;
  const announcement = guessAnnouncement({ kind, roundNumber: game.roundNumber, answer: lastRound?.pokemon.name ?? null, solveOrder: player?.solveOrder ?? null, roundPoints: player?.roundPoints ?? 0, lastWrong: ownLast?.guessedPokemon.name ?? null, attemptCount: player?.attemptCount ?? 0 });

  const meta = active ? <>
    <Chip tone="info">Zoom {zoomLabel(zoom)}</Chip>
    <Chip tone="warn">Nivel {game.currentZoomStage + 1} de {stages} · bonificación +{game.currentZoomBonus}</Chip>
  </> : null;

  const nextZoom = game.nextTransitionAt
    ? <Chip tone="neutral" icon={<Icon icon={ZoomOut} size={18} />}>Menos zoom en {Math.max(1, transitionRemaining)}s</Chip>
    : <Chip tone="neutral" icon={<Icon icon={ZoomOut} size={18} />}>Último nivel de zoom</Chip>;

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.imageUrl }]} details={<>Generación {lastRound.pokemon.generation} · {zoomedSourceLabel(lastRound.imageSourceType)}</>}
      clueTitle={`Así empezó · Zoom ${zoomLabel(firstZoom)}`} clue={<ZoomViewport className={s.revealCrop} source={lastRound.initialCropUrl} sourceType={lastRound.imageSourceType} zoom={firstZoom} alt={`Recorte inicial, zoom ${zoomLabel(firstZoom)}`} />} />
    : <GuessClue label="Recorte ampliado del Pokémon misterioso" variant="dark" className={s.stage}>
      <ZoomViewport source={game.imageUrl ?? ''} sourceType={game.imageSourceType ?? 'SPRITE'} zoom={zoom} alt="Detalle ampliado del Pokémon misterioso" />
      {active && <span className={s.next}>{nextZoom}</span>}
    </GuessClue>;

  const hints = active && game.visibleHints.length > 0
    ? <GuessHints hints={game.visibleHints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describeZoomedHint(hint) }))} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? `Zoom ${zoomLabel(solve.zoom)} · +${solve.zoomBonus} extra` : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solves))} selfId={selfId} />
      <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />
    </>;

  const bottom = <GuessPanel kind={kind} titleRef={titleRef} question={QUESTION} guessText={SCORING} gameName={GAME_NAME}
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }}
    cooldownMs={cooldownMs} lastWrong={ownLast?.guessedPokemon.name ?? null} attemptCount={player?.attemptCount ?? 0}
    solveOrder={player?.solveOrder ?? null} roundPoints={player?.roundPoints ?? 0}
    verdict={lastRound ? guessVerdict(lastRound.solves, selfId, participating) : null} countdown={`${last ? 'Clasificación' : 'Siguiente ronda'} en ${Math.max(1, transitionRemaining)}s`} />;

  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  return <GuessScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={heading} meta={meta} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
