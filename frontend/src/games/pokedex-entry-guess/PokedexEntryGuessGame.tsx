import type { PokedexEntryGuessConfig, PokedexEntryGuessPlayerState, PokedexEntryGuessPublicState } from '@pokemon-universe/shared/public';
import { BookOpenText } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { describePokedexEntryHint, entrySegments, fitFontSize } from './presentation';
import { usePokemonPool } from '../../hooks/usePokemonPool';
import { Chip, Icon } from '../../ui';
import { GamePanel, GameScreen } from '../../room/game-kit/GameScreen';
import {
  GuessAttemptsFeed, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal,
  guessPublicAttempts, guessRevealLines, guessScoreboard, guessSolvedOrders, useGuessRound,
} from '../../room/guess-kit';
import type { ActiveGameProps } from '../../room/room-command';
import s from './Entry.module.css';

const GAME_NAME = 'Pokédex Entry Guess';
const QUESTION = '¿De quién es esta entrada?';
const SCORING = 'Cuanto antes aciertes, más puntos; tras un fallo hay una breve espera.';
/** Letra de la entrada: nunca menos de 15 px; como mucho 56 px o un tercio del alto libre. */
const ENTRY_MIN_PX = 15;
const ENTRY_MAX_PX = 56;

/**
 * La entrada de la Pokédex (sin el nombre: el servidor lo tapa con «???»). La letra se ajusta al sitio libre: lo más
 * grande que quepa sin desplazarse (a 1920 llena la zona; a 390 cabe en la franja), con 15 px de mínimo.
 */
export function EntryText({ text }: { text: string }) {
  const ref = useRef<HTMLQuoteElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const box = element?.parentElement;
    if (!element || !box || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const max = Math.max(ENTRY_MIN_PX, Math.min(ENTRY_MAX_PX, Math.floor(box.clientHeight / 3)));
      const fits = (px: number) => {
        element.style.fontSize = `${px}px`;
        return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1;
      };
      element.style.fontSize = `${fitFontSize(fits, ENTRY_MIN_PX, max)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);
  return <blockquote ref={ref} className={s.entry} data-testid="pokedex-entry">
    <span className={s.quote} aria-hidden="true">“</span>
    {entrySegments(text).map((segment, index) => segment.masked
      ? <span key={index} className={s.mask}><span aria-hidden="true">{segment.text}</span><span className="sr-only">nombre oculto</span></span>
      : <span key={index}>{segment.text}</span>)}
    <span className={s.quote} aria-hidden="true">”</span>
  </blockquote>;
}

/**
 * Pokédex Entry Guess con el kit de adivinar (spec §2 y §6 «Juegos»). Arriba se lee: la placa de la ronda (con la
 * generación de referencia), la entrada en un panel crema que llena el sitio libre y las pistas adicionales; en la
 * revelación, la carta del Pokémon con la entrada completa al lado. Abajo se actúa: el buscador, el acierto con sus
 * puntos o el veredicto. Al lado, el marcador y los intentos (o los puntos de la ronda).
 *
 * Privacidad: la entrada llega con el nombre tapado («???»); la respuesta solo llega en `lastRound`, que el servidor
 * manda al revelar, y la pantalla solo la usa en `ROUND_RESULTS`.
 */
export function PokedexEntryGuessGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokedexEntryGuessPublicState;
  const player = room.gamePlayerState as PokedexEntryGuessPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokedexEntryGuessConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [] });
  const round = useGuessRound({ room, selfId, game, player, answer: (result) => result.pokemon.name, roundSeconds: config?.roundSeconds });
  const { members, colors, active, lastRound, announcement, timer } = round;
  const heading = lastRound ? `¡Era ${lastRound.pokemon.name}!` : 'Reconoce su entrada';

  const clue = lastRound
    ? <GuessRoundReveal answers={[{ name: lastRound.pokemon.name, sprite: lastRound.pokemon.sprite }]} details={<>{lastRound.entry.versionLabel} · Generación {lastRound.entry.generation}</>}
      clueTitle="La entrada completa" clue={<blockquote className={s.reveal}>“{lastRound.entry.text}”</blockquote>} className={s.scene} />
    : <GamePanel label="Entrada de la Pokédex" className={s.stage}>
      <Icon icon={BookOpenText} className={s.mark} />
      <EntryText text={game.entryText ?? ''} />
    </GamePanel>;

  const hints = active && game.hints.length > 0
    ? <GuessHints hints={game.hints.map((hint, index) => ({ key: `${hint.kind}-${index}`, label: describePokedexEntryHint(hint) }))} />
    : null;

  const side = lastRound
    ? <GuessRevealBoard lines={guessRevealLines(room.members, lastRound.solves, lastRound.attemptCounts)} selfId={selfId} />
    : <>
      <GuessPlayersPanel lines={guessScoreboard(room.members, game.scores, guessSolvedOrders(game.solvedPlayers))} selfId={selfId} />
      {guessPublicAttempts(config) && <GuessAttemptsFeed attempts={game.attempts} members={members} colors={colors} />}
    </>;

  const bottom = <GuessPanel {...round.panel} question={QUESTION} guessText={SCORING} gameName={GAME_NAME}
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'GUESS_POKEMON', pokemonId }) }} />;

  return <GameScreen gameName={GAME_NAME} roundNumber={game.roundNumber} phase={game.phase} totalRounds={game.totalRounds} heading={heading}
    meta={<Chip tone="info">Referencia Gen {game.referenceGeneration}</Chip>} timer={timer}
    announcement={announcement} clue={clue} hints={hints} side={side} bottom={bottom} />;
}
