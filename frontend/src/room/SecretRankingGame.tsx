import type { RoomView, SecretRankingConfig, SecretRankingPlayerState, SecretRankingPokemon, SecretRankingPublicState, SecretRankingRoundResult } from '@pokemon-universe/shared/public';
import { ArrowDown, ArrowUp, CheckCircle2, Clock3, Eye, ListOrdered, LockKeyhole, Trophy, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Avatar } from '../components/Avatar';
import {
  MAX_RANKING_DISTANCE, formatDistance, moveRankingItem, rankingFocusAfterMove, rankingMoveText, rankingPlayerStatus, rankingPositionOf, rankingStandings,
  secretRankingAnnouncement, secretRankingCurrentStep, secretRankingHeading, secretRankingSteps, secretRankingVerdict, submitRanking,
  type MoveDirection,
} from '../games/secret-ranking/presentation';
import { useRemainingMs, useServerOffset } from '../hooks/useServerTime';
import { Bar, Chip, cx, Icon, Panel, Pill, Row, StateBox } from '../ui';
import { useFocusOnTransition, useRefocusAfterReject } from './focus-transition';
import { guessSprite, pointsWord } from './guess-kit';
import { playerColor } from './player-color';
import { PhaseRail, ResponseProgress, SocialPlate, SocialScreen, socialFocusKey, type SocialPlateContent } from './social-kit';
import s from '../games/secret-ranking/SecretRanking.module.css';

const GAME_NAME = 'Secret Ranking';

/** Lista local de esta ronda: el orden, el último movimiento (para la región viva) y el botón que recibe el foco. */
interface Draft {
  key: string;
  order: SecretRankingPokemon[];
  move: string | null;
  seq: number;
  focus: string | null;
}

/**
 * La lista que se ordena (pantalla de arriba): la pregunta y los cinco Pokémon en franjas numeradas. Con `onMove`, cada
 * franja lleva «Subir X» y «Bajar X» (teclado y puntero; sin arrastrar). Sin `onMove` (bloqueada u observando), solo
 * el orden.
 */
function RankingBoard({ kicker, prompt, help, order, onMove, movesDisabled = false, listRef, locked }: {
  kicker: string;
  prompt: string;
  help?: string | undefined;
  order: readonly SecretRankingPokemon[];
  onMove?: ((index: number, direction: MoveDirection) => void) | undefined;
  /** Enviando: los botones siguen en su sitio (el foco no se pierde) pero deshabilitados. */
  movesDisabled?: boolean;
  listRef: RefObject<HTMLOListElement | null>;
  locked: boolean;
}) {
  return <Panel variant="cream" as="section" aria-labelledby="ranking-question" className={cx(s.board)} bodyClassName={cx(s.boardBody)}>
    <div className={s.question}>
      <span className={s.kicker}>{kicker}</span>
      <p id="ranking-question" className={s.prompt} data-testid="social-prompt">{prompt}</p>
      {help && <p className={s.help}>{help}</p>}
    </div>
    <ol ref={listRef} className={s.list} aria-label={locked ? 'Tu ranking bloqueado' : onMove ? 'Tu ranking: del primer extremo al último' : 'Pokémon de la ronda'} data-testid="ranking-list">
      {order.map((pokemon, index) => <li key={pokemon.id} className={s.item} data-ranking-item={pokemon.id}>
        <Row rank={index + 1} name={pokemon.name} avatar={<img className={s.sprite} src={guessSprite(pokemon.sprite)} alt="" />}>
          {onMove && <span className={s.moves}>
            <Pill size="round" variant="cream" icon={ArrowUp} aria-label={`Subir ${pokemon.name}`} data-move={`${pokemon.id}:up`} disabled={movesDisabled || index === 0} onClick={() => onMove(index, -1)} />
            <Pill size="round" variant="cream" icon={ArrowDown} aria-label={`Bajar ${pokemon.name}`} data-move={`${pokemon.id}:down`} disabled={movesDisabled || index === order.length - 1} onClick={() => onMove(index, 1)} />
          </span>}
        </Row>
      </li>)}
    </ol>
  </Panel>;
}

/** Revelación (pantalla de arriba): el ranking promedio del grupo y cómo ordenó cada jugador. */
function RankingReveal({ result, room, selfId }: { result: SecretRankingRoundResult; room: RoomView; selfId: string }) {
  const members = new Map(room.members.map((member, index) => [member.id, { member, index }]));
  const players = rankingStandings(result);
  const nameOf = (playerId: string) => members.get(playerId)?.member.displayName ?? 'Entrenador';
  // Quién envió ranking, en el orden de la sala: el puesto que dio cada uno a cada Pokémon del consenso.
  const submitted = room.members.map((member) => member.id).filter((playerId) => result.players[playerId]?.ranking);
  return <div className={s.reveal}>
    <Panel variant="cream" as="section" aria-labelledby="ranking-consensus-title" scroll scrollLabel="Ranking promedio del grupo" className={cx(s.revealPanel)} bodyClassName={cx(s.revealBody)}>
      <h2 id="ranking-consensus-title" className={s.panelKicker}>Ranking promedio del grupo</h2>
      <p className={s.intro} title={result.prompt} data-testid="social-prompt">{result.prompt}</p>
      {result.consensus.length
        ? <ol className={s.rows} aria-label="Consenso del grupo" data-testid="ranking-consensus">{result.consensus.map((entry, index) => <li key={entry.pokemon.id}>
          <Row rank={index + 1} name={entry.pokemon.name} avatar={<img className={s.consensusSprite} src={guessSprite(entry.pokemon.sprite)} alt="" />}
            meta={<span className={s.consensusMeta}>
              <span>Posición media {formatDistance(entry.averagePosition)}</span>
              {submitted.length > 0 && <span className={s.positions} data-testid="ranking-positions">{submitted.map((playerId) => `${nameOf(playerId)} ${rankingPositionOf(result, playerId, entry.pokemon.id)}.º`).join(' · ')}</span>}
            </span>} />
        </li>)}</ol>
        : <StateBox kind="empty" live={false} onCream title="Nadie completó el ranking a tiempo." />}
      <p className={s.note}>Este orden usa todos los rankings enviados.</p>
    </Panel>
    <Panel variant="cream" as="section" aria-labelledby="ranking-players-title" scroll scrollLabel="Cómo ordenó cada uno" className={cx(s.revealPanel)} bodyClassName={cx(s.revealBody)}>
      <h2 id="ranking-players-title" className={s.panelKicker}>Cómo ordenó cada uno</h2>
      <ol className={s.rows} aria-label="Rankings revelados" data-testid="ranking-players">{players.map((playerId) => {
        const entry = members.get(playerId);
        const name = entry?.member.displayName ?? 'Entrenador';
        const ranking = result.players[playerId]?.ranking ?? null;
        return <li key={playerId} data-testid="ranking-player">
          <Row name={name} color={playerColor(entry?.index ?? 0)} self={playerId === selfId} avatar={<Avatar name={name} avatar={entry?.member.avatar} size="sm" />}
            meta={ranking
              ? <ol className={s.strip} aria-label={`Orden de ${name}`}>{ranking.map((pokemon, index) => <li key={pokemon.id} className={s.stripItem} title={`${index + 1}. ${pokemon.name}`}>
                <span className={s.stripRank} aria-hidden="true">{index + 1}</span>
                <img className={s.stripSprite} src={guessSprite(pokemon.sprite)} alt="" />
                <span className="sr-only">{index + 1}. {pokemon.name}</span>
              </li>)}</ol>
              : <Chip tone="bad" icon={<Icon icon={X} size={18} />}>No envió ranking</Chip>} />
        </li>;
      })}</ol>
    </Panel>
  </div>;
}

/** Columna lateral de la revelación: la cercanía de cada jugador al grupo, con su barra, su distancia en texto y los puntos. */
function ClosenessPanel({ result, room, selfId }: { result: SecretRankingRoundResult; room: RoomView; selfId: string }) {
  const members = new Map(room.members.map((member, index) => [member.id, { member, index }]));
  return <Panel title="Cercanía de la ronda" variant="dark" scroll scrollLabel="Cercanía de la ronda">
    <ol className={s.closeRows} aria-label="Cercanía de la ronda">{rankingStandings(result).map((playerId) => {
      const entry = members.get(playerId);
      const name = entry?.member.displayName ?? 'Entrenador';
      const player = result.players[playerId]!;
      const status = rankingPlayerStatus(result, playerId);
      return <li key={playerId} data-testid="ranking-closeness">
        <Row name={name} {...(player.position !== null ? { rank: player.position } : {})} color={playerColor(entry?.index ?? 0)} self={playerId === selfId}
          disconnected={entry?.member.presence !== undefined && entry.member.presence !== 'CONNECTED'} avatar={<Avatar name={name} avatar={entry?.member.avatar} size="sm" />}
          meta={<span className={s.closeMeta}>
            <Chip tone={status.tone} {...(status.tone === 'ok' ? { icon: <Icon icon={Trophy} size={18} /> } : status.tone === 'bad' ? { icon: <Icon icon={X} size={18} /> } : {})}>{status.text}</Chip>
            {player.distance !== null && <span className={s.distance}>
              <Bar value={MAX_RANKING_DISTANCE - player.distance} max={MAX_RANKING_DISTANCE} tone={player.position === 1 ? 'ok' : 'info'} label={`Cercanía de ${name}`} decorative grow />
              <span className={s.distanceText}>Distancia {formatDistance(player.distance)}</span>
            </span>}
          </span>}
          value={<span className={s.value}>+{player.pointsAwarded}</span>} />
      </li>;
    })}</ol>
    <p className={s.closeNote}><Icon icon={LockKeyhole} size={18} />Distancia a la media de los demás: la de cada persona excluye siempre su propio ranking. Más corta, más puntos.</p>
  </Panel>;
}

/**
 * Secret Ranking con el kit social (spec §2 y §6 «Juegos»). Arriba: la placa de la ronda con el plazo y «Saltar», las
 * fases y la pregunta con la lista de cinco Pokémon que cada jugador ordena en secreto (botones «Subir»/«Bajar» con
 * teclado o puntero; el foco sigue al Pokémon movido y la región viva dice a qué puesto pasa). Abajo, «Bloquear ranking»
 * o el estado; al lado, quién ha terminado (nunca su orden). Al revelar: el ranking promedio, cómo ordenó cada uno y,
 * al lado, la distancia de cada jugador a los demás con su barra y sus puntos.
 *
 * Privacidad: el orden propio solo vuelve en `ownRanking`; los de los demás solo en `lastRound`, que la pantalla lee
 * únicamente en `ROUND_RESULTS`.
 */
export function SecretRankingGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction(action: unknown): Promise<void> }) {
  const game = room.game as SecretRankingPublicState;
  const player = room.gamePlayerState as SecretRankingPlayerState | null;
  const config = room.selectedGameConfig as Partial<SecretRankingConfig> | null;
  const offset = useServerOffset(room.serverNow);
  const participating = player?.role === 'PLAYER';
  const active = game.phase === 'ROUND_ACTIVE';
  // La revelación (los rankings de todos) solo en su fase: un `lastRound` sobrante nunca llega al DOM.
  const result = game.phase === 'ROUND_RESULTS' ? game.lastRound : null;
  const transitionMs = useRemainingMs(result ? game.nextTransitionAt : null, offset);
  const own = participating ? player.ownRanking : null;
  const locked = active && own !== null;

  // Orden local de esta ronda (empieza de cero con cada ronda o con otros cinco Pokémon).
  const boardKey = useMemo(() => `${game.roundNumber}:${game.pokemon.map((pokemon) => pokemon.id).join('|')}`, [game.roundNumber, game.pokemon]);
  const [draft, setDraft] = useState<Draft>({ key: boardKey, order: game.pokemon, move: null, seq: 0, focus: null });
  const current = draft.key === boardKey ? draft : { key: boardKey, order: game.pokemon, move: null, seq: 0, focus: null };
  const [busyRound, setBusyRound] = useState<number | null>(null);
  const busy = busyRound === game.roundNumber;
  const open = active && participating && player.canSubmit && !locked;

  const listRef = useRef<HTMLOListElement>(null);
  // Tras mover, el foco va al botón del Pokémon movido en su nuevo puesto (React mueve su nodo y el foco se perdería).
  useLayoutEffect(() => {
    if (!current.focus) return;
    const target = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-move]') ?? []).find((button) => button.dataset.move === current.focus);
    target?.focus();
  }, [current.focus, current.seq]);

  const move = (index: number, direction: MoveDirection) => {
    const pokemon = current.order[index];
    if (!pokemon || !open || busy) return;
    const order = moveRankingItem(current.order, index, direction);
    const to = index + direction;
    setDraft({ key: boardKey, order, move: rankingMoveText(pokemon.name, to + 1), seq: current.seq + 1, focus: `${pokemon.id}:${rankingFocusAfterMove(to, order.length, direction)}` });
  };

  const submit = async () => {
    if (!open || busy) return;
    const pokemonIds = current.order.map((pokemon) => pokemon.id);
    await submitRanking(game.roundNumber, () => onAction({ type: 'SUBMIT_RANKING', pokemonIds }), setBusyRound);
  };
  // Rechazado (en la misma ronda deja de estar ocupado y sigue abierto): el botón vuelve a estar activo y el foco, que
  // estaba en él mientras se deshabilitaba, vuelve a él en vez de quedarse en el `body`.
  const submitRef = useRef<HTMLButtonElement>(null);
  useRefocusAfterReject(game.roundNumber, busy, open, submitRef);

  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const nameOf = (id: string) => members.get(id)?.displayName ?? 'Entrenador';
  const playerIds = useMemo(() => room.members.filter((member) => game.scores[member.id] !== undefined).map((member) => member.id), [room.members, game.scores]);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnTransition(socialFocusKey(game.phase, game.roundNumber, 1, locked), titleRef);

  const last = game.roundNumber >= game.totalRounds;
  const timer = active
    ? { deadline: game.roundEndsAt, serverOffset: offset, label: 'Para ordenar', totalMs: config?.roundSeconds ? config.roundSeconds * 1_000 : undefined }
    : { deadline: game.nextTransitionAt, serverOffset: offset, label: last ? 'Clasificación' : 'Siguiente ronda' };

  const stage = result
    ? <RankingReveal result={result} room={room} selfId={selfId} />
    : <RankingBoard listRef={listRef} prompt={game.prompt} locked={locked}
      kicker={open ? 'Ordena según esta pregunta' : locked ? 'Tu ranking · solo lo ves tú' : 'Los cinco Pokémon de la ronda'}
      help={open ? 'Tu posición 1 debe ser la que mejor encaja con el primer extremo.' : undefined}
      order={own ?? (participating ? current.order : game.pokemon)} onMove={open ? move : undefined} movesDisabled={busy} />;

  const side = result
    ? <ClosenessPanel result={result} room={room} selfId={selfId} />
    : <ResponseProgress title="Rankings recibidos" members={room.members} playerIds={playerIds} doneIds={game.submittedPlayerIds} selfId={selfId}
      doneText="Listo" pendingText="Ordenando…" note="Solo se muestra quién ha terminado; los órdenes permanecen secretos hasta el resultado." />;

  let bottom;
  if (open) {
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={{
      icon: ListOrdered, tone: 'info', kicker: <span className={s.plateKicker}>Tu ranking secreto</span>, title: 'Una vez bloqueado, no se cambia',
      text: 'Usa Subir y Bajar en cada uno. Después de enviarlo no podrás cambiar el orden.',
      aside: <><Pill ref={submitRef} variant="yellow" icon={LockKeyhole} loading={busy} disabled={current.order.length !== 5} onClick={() => void submit()} className={s.submit} data-testid="ranking-submit" aria-describedby="ranking-submit-warning">Bloquear ranking</Pill>
        {/* El aviso completo para lectores a todos los tamaños (la ayuda de la placa se oculta donde falta alto). */}
        <span id="ranking-submit-warning" className="sr-only">Después de bloquearlo no podrás cambiar el orden.</span></>,
    }} />;
  } else if (locked) {
    bottom = <SocialPlate titleRef={titleRef} content={{
      icon: CheckCircle2, tone: 'ok', kicker: 'Tu ranking', title: 'Ranking bloqueado', text: 'Esperando a los demás jugadores. Solo tú ves tu orden hasta el resultado.',
      aside: <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Enviado</Chip>,
    }} />;
  } else if (active && participating) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'warn', kicker: 'Ranking cerrado', title: 'Se acabó el tiempo', text: 'Esta ronda ya no admite rankings. Verás el resultado en un momento.' }} />;
  } else if (active) {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Eye, tone: 'info', kicker: 'No ordenas en esta ronda', title: 'Estás observando', text: 'Los rankings se revelarán al cerrar la ronda.' }} />;
  } else if (result) {
    const verdict = secretRankingVerdict(result, selfId, participating);
    const seconds = Math.max(1, Math.ceil(transitionMs / 1_000));
    const content: SocialPlateContent = {
      icon: verdict.tone === 'ok' ? Trophy : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: `${last ? 'Clasificación' : 'Siguiente ronda'} en ${seconds}s`,
      text: 'Los puntos se reparten por cercanía: quien más se parece a la media de los demás, más suma.',
      ...(verdict.points > 0 ? { aside: <strong className={s.points}>+{verdict.points}<small> {pointsWord(verdict.points)}</small></strong> } : {}),
    };
    bottom = <SocialPlate titleRef={titleRef} textClassName={s.plateHelp} content={content} />;
  } else {
    bottom = <SocialPlate titleRef={titleRef} content={{ icon: Clock3, tone: 'info', kicker: GAME_NAME, title: 'Preparando la ronda…', text: 'La partida sigue en un momento.' }} />;
  }

  const announcement = secretRankingAnnouncement({ phase: game.phase, roundNumber: game.roundNumber, locked, move: open ? current.move : null, moveSeq: current.seq, result, nameOf });

  return <SocialScreen gameName={GAME_NAME} roundNumber={game.roundNumber} totalRounds={game.totalRounds} heading={secretRankingHeading(game.phase, result, locked)} timer={timer}
    announcement={announcement} phases={<PhaseRail steps={secretRankingSteps} current={secretRankingCurrentStep(game.phase)} />} stage={stage} side={side} bottom={bottom} />;
}
