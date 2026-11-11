import type { PokeddlePublicBoard, PokeddleRaceConfig, PokeddleRacePlayerState, PokeddleRacePublicState, RoomMemberView } from '@pokemon-universe/shared/public';
import { Check, CheckCircle2, Clock3, Eye, Flag, Search, Send, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { useSfxCue } from '../hooks/useSfxCue';
import { Badge, Chip, cx, Dialog, Icon, Panel, Row, RowButton, StateBox } from '../ui';
import { useFocusOnTransition } from './focus-transition';
import { GuessPanel, guessSprite, type GuessPlateContent } from './guess-kit';
import { GameScreen } from './game-kit/GameScreen';
import { PokeddleBoard, PokeddleLegend } from './PokeddleBoard';
import { playerColor } from './player-color';
import type { PokemonSearchOption } from './pokemon-search';
import {
  pokeddleAnnouncement, pokeddleAttemptsText, pokeddleFocusKey, pokeddleMatchCount, pokeddlePlateKind, pokeddleRivalStatus, pokeddleVisibleSecret,
  type PokeddlePlateKind, type PokeddleRivalStatus,
} from './pokeddle-presentation';
import type { ActiveGameProps } from './room-command';
import { useRoomMembers } from './room-members';
import s from '../games/pokeddle-race/PokeddleRace.module.css';

const GAME_NAME = 'Pokédle Race';

const offline = (member: RoomMemberView | undefined) => member?.presence !== undefined && member.presence !== 'CONNECTED';

const rivalChip: Record<PokeddleRivalStatus['kind'], { tone: 'ok' | 'info' | 'neutral'; icon: typeof Check }> = {
  solved: { tone: 'ok', icon: Check },
  answered: { tone: 'info', icon: Send },
  thinking: { tone: 'neutral', icon: Search },
  waiting: { tone: 'neutral', icon: Flag },
};

/**
 * La carrera en la columna lateral: una franja por jugador (sin espectadores) con su color, su estado en texto (resuelto
 * con su Pokémon, intento enviado o pensando) y sus cuentas. La de cada rival es un botón que abre su tablero completo
 * (lo que ya proyecta el servidor: sus intentos y pistas, nunca su secreto sin resolver).
 */
function RacePanel({ game, members, colors, selfId, onOpen }: { game: PokeddleRacePublicState; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; onOpen(id: string): void }) {
  const ids = [...members.keys()].filter((id) => game.boards[id]);
  const missing = Object.keys(game.boards).filter((id) => !members.has(id));
  return <Panel title="Carrera" variant="dark" scroll scrollLabel="Progreso de cada jugador" right={<Badge tone="cream">{`${ids.length + missing.length} ${ids.length + missing.length === 1 ? 'jugador' : 'jugadores'}`}</Badge>}>
    <ol className={s.rows} aria-label="Progreso de cada jugador">{[...ids, ...missing].map((id) => {
      const board = game.boards[id]!;
      const member = members.get(id);
      const name = member?.displayName ?? 'Entrenador';
      const status = pokeddleRivalStatus(board, game.phase, game.answeredPlayerIds.includes(id));
      const secret = pokeddleVisibleSecret(board, game.phase);
      const chip = rivalChip[status.kind];
      const justSolved = board.solved && board.solvedRound === game.roundNumber && game.phase === 'ROUND_RESULTS';
      const self = id === selfId;
      const row = { name: self ? `${name} (tú)` : name, color: playerColor(colors.get(id) ?? 0), self, highlight: justSolved, disconnected: offline(member),
        avatar: <Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />,
        meta: <span className={s.rowMeta}>
          <Chip tone={chip.tone} icon={<Icon icon={chip.icon} size={18} />}>{status.label}</Chip>
          <span className={s.detail}>{status.detail}</span>
        </span>,
        ...(secret ? { value: <img className={s.rowSprite} src={guessSprite(secret.sprite)} alt="" /> } : {}) };
      return <li key={id} data-testid="pokeddle-race-row" aria-current={self ? 'true' : undefined}>
        {self ? <Row {...row} /> : <RowButton {...row} label={`Ver tablero de ${name}: ${status.label}, ${status.detail}`} onClick={() => onOpen(id)} cue={{ icon: Eye, text: 'Ver' }} />}
      </li>;
    })}</ol>
  </Panel>;
}

function plateContent(kind: PokeddlePlateKind, { game, own, submitted, countdown }: { game: PokeddleRacePublicState; own: PokeddlePublicBoard | null; submitted: PokemonSearchOption | null; countdown: string }): GuessPlateContent {
  const secret = own ? pokeddleVisibleSecret(own, game.phase) : null;
  switch (kind) {
    case 'guess': return { icon: Search, tone: 'info', kicker: `Tu intento · Ronda ${game.roundNumber}`, title: '¿Cuál es tu Pokémon?', text: 'Un intento por ronda: al cerrarse verás en qué pistas coincide.' };
    case 'submitted': return {
      icon: Send, tone: 'ok', kicker: 'Intento enviado', title: submitted ? `${submitted.name} enviado` : 'Intento enviado', text: 'Esperando al resto: las pistas salen al cerrar la ronda.',
      ...(submitted ? { aside: <img className={s.plateSprite} src={submitted.sprite} alt="" /> } : {}),
    };
    case 'solved': return {
      icon: CheckCircle2, tone: 'ok', kicker: <Badge>Ronda {own?.solvedRound ?? game.roundNumber} · {pokeddleAttemptsText(own?.validGuesses ?? 0)}</Badge>, title: '¡Pokémon encontrado!',
      text: 'Tu Pokémon ya es público y no bloqueas las rondas: sigue la carrera de los demás.',
      ...(secret ? { aside: <img className={s.plateSprite} src={guessSprite(secret.sprite)} alt="" /> } : {}),
    };
    case 'reveal': {
      const row = own?.rows.find((entry) => entry.round === game.roundNumber);
      const text = !row || row.status === 'NO_GUESS' ? 'No respondiste a tiempo: la ronda cuenta como sin respuesta.' : `${row.guessedPokemon?.name ?? 'Tu intento'} coincide en ${pokeddleMatchCount(row)} de ${Object.keys(row.feedback ?? {}).length} pistas.`;
      return { icon: Flag, tone: 'info', kicker: `Ronda ${game.roundNumber} cerrada`, title: countdown, text };
    }
    case 'watching': return { icon: Eye, tone: 'info', kicker: 'No juegas esta partida', title: 'Estás observando', text: 'Sigue la carrera en directo: abre el tablero de cada jugador desde su franja.' };
    case 'out': return { icon: Eye, tone: 'info', kicker: `Ronda ${game.roundNumber}`, title: 'No puedes responder ahora', text: 'Tu tablero sigue guardado en el servidor.' };
    default: return { icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Esperando al servidor…', text: 'La ronda empieza en un momento.' };
  }
}

/**
 * Pokédle Race (spec §2 y §6 «Juegos») con el marco de los juegos de adivinar. Arriba, la placa de la ronda y el tablero
 * de intentos propio (una fila por ronda, la última arriba, con una casilla por pista); abajo, el buscador o el estado
 * del intento; al lado, la carrera: el progreso de cada jugador en franjas.
 *
 * Privacidad: cada jugador tiene su Pokémon secreto. Solo se pinta el de quien ya lo encontró (o al terminar la partida),
 * por `pokeddleVisibleSecret`; de los rivales solo se ve lo que ya era público (resuelto, intento enviado y cuentas).
 */
export function PokeddleRaceGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokeddleRacePublicState;
  const player = room.gamePlayerState as PokeddleRacePlayerState | null;
  const config = room.selectedGameConfig as Partial<PokeddleRaceConfig> | null;
  const { pokemon, error: loadError, loading: poolLoading, retry: retryPool } = usePokemonPool({ generations: config?.generations ?? [] });
  const offset = useServerOffset(room.serverNow);
  const transitionRemaining = Math.ceil(useRemainingMs(game.nextTransitionAt, offset) / 1_000);
  const { byId: members, colorIndex: colors } = useRoomMembers(room);
  const own = game.boards[selfId] ?? null;
  const active = game.phase === 'ROUND_ACTIVE';
  const kind = pokeddlePlateKind(game.phase, player, own !== null);
  const [rivalId, setRivalId] = useState<string | null>(null);
  const rival = rivalId && rivalId !== selfId ? game.boards[rivalId] ?? null : null;
  const rivalName = rivalId ? members.get(rivalId)?.displayName ?? 'Entrenador' : '';
  const [submitted, setSubmitted] = useState<{ round: number; pokemon: PokemonSearchOption } | null>(null);
  const submittedPokemon = submitted && submitted.round === game.roundNumber && kind === 'submitted' ? submitted.pokemon : null;
  const secret = own ? pokeddleVisibleSecret(own, game.phase) : null;

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(pokeddleFocusKey(kind, game.roundNumber), titleRef);
  useSfxCue('hit', own?.solved ? 'solved' : null);
  useEffect(() => { if (!active) setSubmitted(null); }, [active]);

  const last = game.roundNumber >= game.maxRounds || game.activePlayerIds.length === 0;
  const countdown = `${last ? 'Clasificación' : 'Siguiente ronda'} en ${Math.max(1, transitionRemaining)}s`;
  const rivalsSolved = game.phase === 'ROUND_RESULTS'
    ? Object.values(game.boards).filter((board) => board.playerId !== selfId && board.solved && board.solvedRound === game.roundNumber)
      .map((board) => ({ player: members.get(board.playerId)?.displayName ?? 'Un rival', pokemon: pokeddleVisibleSecret(board, game.phase)?.name ?? null }))
    : [];
  const announcement = pokeddleAnnouncement({ kind, roundNumber: game.roundNumber, own, submittedName: submittedPokemon?.name ?? null, rivalsSolved });
  const heading = secret && own?.solved ? `¡Era ${secret.name}!` : game.phase === 'ROUND_RESULTS' ? `Pistas de la ronda ${game.roundNumber}` : own ? 'Busca tu Pokémon' : 'La carrera Pokédle';
  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Tiempo', totalMs: (config?.roundSeconds ?? 0) * 1_000 }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const clue = own
    ? <PokeddleBoard board={own} clues={game.enabledClues} />
    : <Panel variant="cream" as="section" title="Tableros" className={cx(s.watchPanel)} bodyClassName={cx(s.watchBody)}>
      <StateBox kind="empty" live={false} onCream title="Cada jugador busca su propio Pokémon." text="Abre el tablero de cada jugador desde su franja de la carrera: verás sus intentos y pistas, nunca su Pokémon secreto." />
      <PokeddleLegend />
    </Panel>;

  async function submitGuess(pokemonId: string) {
    const chosen = pokemon.find((entry) => entry.id === pokemonId) ?? null;
    await onAction({ type: 'GUESS_POKEMON', pokemonId });
    if (chosen) setSubmitted({ round: game.roundNumber, pokemon: chosen });
  }

  const bottom = <GuessPanel kind={kind === 'guess' ? 'guess' : 'waiting'} titleRef={titleRef} question="¿Cuál es tu Pokémon?" content={plateContent(kind, { game, own, submitted: submittedPokemon, countdown })}
    selector={{ pokemon, loading: poolLoading, loadError, onRetry: retryPool, inputLabel: `Buscar respuesta para la ronda ${game.roundNumber}`, roundKey: game.roundNumber, onGuess: submitGuess }} />;

  const dialog = <Dialog open={rival !== null} title={`Tablero de ${rivalName}`} width={1200} onClose={() => setRivalId(null)} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined }]}>
    {rival && <PokeddleBoard board={rival} clues={game.enabledClues} mode="rival" owner={rivalName} title="Sus intentos" />}
  </Dialog>;

  return <>{dialog}<GameScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.maxRounds} heading={heading}
    meta={<Chip tone="neutral" icon={<Icon icon={Users} size={18} />}>{game.activePlayerIds.length} en carrera</Chip>}
    timer={timer} announcement={announcement} clue={clue} side={<RacePanel game={game} members={members} colors={colors} selfId={selfId} onOpen={setRivalId} />} bottom={bottom} className={s.screen} /></>;
}
