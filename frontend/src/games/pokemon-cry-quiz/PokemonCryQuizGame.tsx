import type { PokemonCryQuizConfig, PokemonCryQuizPlayerState, PokemonCryQuizPublicState } from '@pokemon-universe/shared/public';
import { Play, RotateCcw, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CRY_PLAY_FAILED, cryAnnouncement, cryAudioEvents, cryVersionLabel, releaseCryDuck } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { Chip, cx, Pill } from '../../ui';
import { GamePanel, GameScreen } from '../../room/game-kit/GameScreen';
import {
  GuessAttemptsFeed, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal,
  guessPublicAttempts, guessRevealLines, guessScoreboard, guessSolvedOrders, useGuessRound,
} from '../../room/guess-kit';
import type { ActiveGameProps } from '../../room/room-command';
import s from './Cry.module.css';

const GAME_NAME = 'Adivina el Grito';
const QUESTION = '¿De quién es este grito?';
const SCORING = 'Escúchalo las veces que quieras: cuanto antes aciertes, más puntos.';
/** Alturas (y desfase del latido) de las barras del ecualizador decorativo. */
const WAVES = [38, 62, 84, 56, 100, 72, 46, 90, 64, 34, 58].map((height, index) => ({ height, delay: (index * 137) % 600 }));

/**
 * El grito: un `<audio>` con la ruta opaca de la ronda (no dice qué Pokémon es) y un `Pill` grande que dice su estado
 * en texto («Reproducir grito» / «Sonando…»). Nunca suena solo: hace falta pulsar. Mientras suena, la música de la
 * sala baja (F2). En la ronda va con un ecualizador decorativo que llena la zona de la pista. Si no suena, el error se
 * ve junto al botón y `onError` lo pasa a la pantalla, que lo anuncia en su región viva (al desmontarse lo limpia).
 */
export function CryPlayer({ source, replay = false, onError }: { source: string; replay?: boolean; onError?(message: string): void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  // Al cambiar de grito se recarga; al montarse no (el `src` ya lo precarga: otra carga lo reiniciaría).
  const loaded = useRef(source);
  useEffect(() => {
    if (loaded.current === source) return;
    loaded.current = source;
    setPlaying(false); setError(''); audioRef.current?.load();
  }, [source]);
  useEffect(() => releaseCryDuck, [source]);
  useEffect(() => { onError?.(error); }, [error, onError]);
  useEffect(() => () => onError?.(''), [onError]);
  const events = cryAudioEvents({ playing: setPlaying, error: setError });
  const play = async () => {
    const element = audioRef.current;
    if (!element) return;
    try { setError(''); element.currentTime = 0; await element.play(); } catch { setError(CRY_PLAY_FAILED); }
  };
  const label = playing ? 'Sonando…' : replay ? 'Volver a escuchar' : 'Reproducir grito';
  const icon = playing ? Volume2 : replay ? RotateCcw : Play;
  return <div className={replay ? s.replay : s.player}>
    {/* `preload="auto"`: el grito llega antes de pulsar (sin `autoplay`). */}
    <audio ref={audioRef} src={source} preload="auto" {...events} />
    {!replay && <span className={cx(s.waves, playing && s.on)} aria-hidden="true">
      {WAVES.map((wave, index) => <i key={index} style={{ '--h': `${wave.height}%`, '--d': `${wave.delay}ms` } as CSSProperties} />)}
    </span>}
    {replay
      ? <Pill variant="yellow" icon={icon} onClick={() => void play()} data-testid="cry-play">{label}</Pill>
      : <Pill variant="yellow" size="main" icon={icon} className={s.play} onClick={() => void play()} data-testid="cry-play">{label}</Pill>}
    {/* Sin `role="alert"`: lo anuncia la región viva de la pantalla (`onError`). */}
    {error && <p className={s.error}><Chip tone="bad">{error}</Chip></p>}
  </div>;
}

/**
 * Adivina el Grito con el kit de adivinar (spec §2 y §6 «Juegos»). Arriba se escucha: la placa de la ronda y el grito
 * (botón grande con su estado en texto y un ecualizador que llena el sitio); en la revelación, la carta del Pokémon con
 * el grito para volver a oírlo. Abajo se actúa: el buscador, el acierto con sus puntos o el veredicto. Al lado, el
 * marcador y los intentos (o los puntos de la ronda).
 *
 * Privacidad: el grito llega por una ruta opaca (`/options/cry/audio`, sin nombre ni número); la respuesta solo llega
 * en `lastRound`, que el servidor manda al revelar, y la pantalla solo la usa en `ROUND_RESULTS`.
 */
export function PokemonCryQuizGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonCryQuizPublicState;
  const player = room.gamePlayerState as PokemonCryQuizPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonCryQuizConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [], includeForms: config?.includeRegionalForms ?? false });
  const round = useGuessRound({ room, selfId, game, player, participating: player?.role === 'PLAYER', answer: (result) => result.pokemon.name, roundSeconds: config?.roundSeconds });
  const { members, colors, lastRound, announcement, timer } = round;
  const [audioError, setAudioError] = useState('');
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : 'Reconoce su grito';

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.pokemon.sprite }]} details={<>Generación {lastRound.pokemon.generation} · {cryVersionLabel(lastRound.cryVersion)}</>}
      clueTitle="Su grito" clue={<CryPlayer source={lastRound.cryUrl} replay onError={setAudioError} />} />
    : <GamePanel label="Grito del Pokémon misterioso" variant="dark" className={s.stage}>
      {game.cryUrl && <CryPlayer source={game.cryUrl} onError={setAudioError} />}
    </GamePanel>;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId}
      detail={({ solve }) => solve ? `Rapidez ${solve.speedPoints} + orden ${solve.placementBonus}` : null} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solvedPlayers))} selfId={selfId} />
      {guessPublicAttempts(config) && <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />}
    </>;

  const bottom = <GuessPanel {...round.panel} question={QUESTION} guessText={SCORING} gameName={GAME_NAME} solvedTitle="¡Grito acertado!"
    watchingText="Puedes escuchar el grito y seguir el marcador."
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para el grito ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;

  return <GameScreen gameName={GAME_NAME} roundNumber={game.roundNumber} phase={game.phase} totalRounds={game.totalRounds} heading={heading} timer={timer}
    announcement={cryAnnouncement(announcement, audioError)} clue={clue} side={side} bottom={bottom} />;
}
