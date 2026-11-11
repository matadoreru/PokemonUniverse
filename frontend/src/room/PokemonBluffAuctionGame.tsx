import type { BluffAuctionAttempt, BluffAuctionRoundResult, PokemonBluffAuctionConfig, PokemonBluffAuctionPlayerState, PokemonBluffAuctionPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3, Copy, Crown, Eye, Hourglass, Mic2, Search, ShieldQuestion, SkipForward, X, XCircle } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import {
  ATTEMPT_TEXT, bluffAnnouncement, bluffBlockInput, bluffHeading, bluffMetrics, bluffResultReason, bluffResultTimerLabel, bluffResultTitle, bluffRoundLabel, bluffRoundLines, bluffRoundResult,
  bluffSeatStatus, bluffSelfVerdict, bluffTimerLabel, bluffTurnOrder, GAME_NAME, latestBids, PASS_RULE, SEAT_STATUS_TEXT, TIME_RULE, UNIT, type BluffSeatStatus,
} from '../games/pokemon-bluff-auction/presentation';
import { usePokemonPool } from '../hooks/usePokemonPool';
import { useSfxCue } from '../hooks/useSfxCue';
import { useServerOffset } from '../hooks/useServerTime';
import { Badge, Bar, Chip, cx, Icon, Panel, Row, type ChipProps } from '../ui';
import { AuctionAward, AuctionLot, AuctionScreen, BidControls, BidHistory, BudgetPlate, amountText, bidBlock, bidEpoch, bidLog, type BudgetEntry } from './auction-kit';
import { useFocusOnTransition } from './game-kit/focus-transition';
import { GuessPanel } from './guess-kit';
import { useRoomMembers } from './room-members';
import type { ActiveGameProps } from './room-command';
import b from '../games/pokemon-bluff-auction/BluffAuction.module.css';

const SEAT_ICON: Record<BluffSeatStatus, LucideIcon> = { leading: Crown, passed: SkipForward, bidding: Hourglass, demonstrating: Search, waiting: Eye };
const SEAT_TONE: Record<BluffSeatStatus, NonNullable<ChipProps['tone']>> = { leading: 'ok', passed: 'neutral', bidding: 'neutral', demonstrating: 'warn', waiting: 'neutral' };
const ATTEMPT_ICON: Record<BluffAuctionAttempt['result'], LucideIcon> = { CORRECT: CheckCircle2, INCORRECT: XCircle, DUPLICATE: Copy };
const ATTEMPT_TONE: Record<BluffAuctionAttempt['result'], NonNullable<ChipProps['tone']>> = { CORRECT: 'ok', INCORRECT: 'bad', DUPLICATE: 'neutral' };

/** La condición de la ronda: lo que se subasta (texto grande que escala con su hueco y las cláusulas en chips). */
function Condition({ description, clauses, compact = false }: { description: string; clauses?: readonly string[]; compact?: boolean }) {
  return <div className={b.condition} data-testid="bluff-condition">
    {!compact && <span className={b.conditionIcon}><Icon icon={ShieldQuestion} size={32} /></span>}
    <p className={b.conditionText}>{description}</p>
    {!compact && clauses && clauses.length > 1 && <span className={b.clauses}>{clauses.map((clause) => <Chip key={clause} tone="info">{clause}</Chip>)}</span>}
  </div>;
}

/** Métricas de la demostración: `Bar`s del catálogo con la cifra en texto al lado. */
function Metrics({ correct, incorrect, target }: { correct: number; incorrect: number; target: number }) {
  return <div className={b.metrics} data-testid="bluff-metrics">{bluffMetrics({ correct, incorrect, target }).map((metric) => <div key={metric.key} className={b.metric} data-testid="bluff-metric" data-metric={metric.key}>
    <span className={b.metricLabel}>{metric.label}</span>
    <Bar value={metric.value} max={metric.max} tone={metric.tone} label={metric.label} showValue valueText={metric.text} size="lg" />
  </div>)}</div>;
}

/** Respuestas enviadas (columna lateral): número, sprite, nombre y el veredicto en texto. Sin región viva propia. */
function AttemptsPanel({ attempts }: { attempts: readonly BluffAuctionAttempt[] }) {
  return <Panel title="Respuestas enviadas" variant="dark" scroll scrollLabel="Respuestas enviadas" right={<Badge tone="cream">{`${attempts.length} ${attempts.length === 1 ? 'intento' : 'intentos'}`}</Badge>}
    status={attempts.length === 0 ? { kind: 'empty', title: 'Aún no hay respuestas.', text: 'Los intentos aparecen aquí para todo el grupo.', live: false } : null}>
    <ol className={b.rows} aria-label="Respuestas de la demostración">{attempts.map((attempt, index) => <li key={`${attempt.pokemon.id}-${attempt.submittedAt}-${index}`} data-testid="bluff-attempt" data-result={attempt.result}>
      <Row rank={index + 1} name={attempt.pokemon.name} avatar={<img className={b.sprite} src={attempt.pokemon.sprite} alt="" />}
        meta={<span className={b.rowMeta}>
          <Chip tone={ATTEMPT_TONE[attempt.result]} icon={<Icon icon={ATTEMPT_ICON[attempt.result]} size={18} />}>{ATTEMPT_TEXT[attempt.result]}</Chip>
          {attempt.result === 'DUPLICATE' && <span className={b.note}>No cambia el tiempo</span>}
        </span>} />
    </li>)}</ol>
  </Panel>;
}

/**
 * Pokémon Bluff Auction con el kit de subasta (spec §2 y §6 «Juegos»), en un único `AuctionScreen` para toda la ronda:
 * - Subasta: la condición en la escena con la puja actual, quién va ganando y la mínima; abajo los controles (Mínima,
 *   +2 y +5, campo, «Pujar N» y «Pasar esta ronda» con confirmación); al lado la mesa (orden, estado, última puja,
 *   puntos) y las pujas de la ronda.
 * - Demostración: la condición, quién apostó y las métricas en `Bar`s; abajo el buscador (solo quien apostó) o quién
 *   está buscando; al lado la mesa y las respuestas enviadas.
 * - Resultado: si cumplió o era un farol y por qué, las métricas; al lado los puntos de cada jugador y las respuestas.
 *
 * Privacidad: lo único oculto es cuántos Pokémon cumplen la condición; `lastRound` solo se lee en `ROUND_RESULTS`.
 */
export function PokemonBluffAuctionGame({ room, selfId, onAction }: ActiveGameProps) {
  const game = room.game as PokemonBluffAuctionPublicState;
  const player = room.gamePlayerState as PokemonBluffAuctionPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonBluffAuctionConfig> | null;
  const offset = useServerOffset(room.serverNow);
  useSfxCue(game.currentBid != null ? 'game.bid' : null, `${game.roundNumber}:${game.currentBid ?? ''}`);

  const members = useRoomMembers(room); const { nameOf, colorOf } = members;
  const avatarOf = (id: string, size: 'sm' | 'md' | 'lg' = 'sm') => <Avatar name={nameOf(id)} avatar={members.get(id)?.avatar} size={size} />;

  const result = bluffRoundResult(game);
  const searching = game.phase === 'POKEMON_SEARCH' && game.bidderId !== null;
  const block = bidBlock(bluffBlockInput(game, player, selfId, nameOf));
  const epoch = bidEpoch(game.roundNumber, game.bidHistory.length);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Cambia con la fase, la ronda y el estado propio: el foco va al título de la placa de abajo (nunca cae al `body`).
  useFocusOnTransition(`${game.phase}-${game.roundNumber}-${result ? 'result' : searching ? 'search' : block.reason}`, titleRef);

  const canSearch = Boolean(player?.canSubmitPokemon);
  const pool = usePokemonPool({ generations: config?.generations ?? [], includeForms: false, enabled: canSearch });
  const bidSeconds = config?.bidSeconds ?? 20;
  const order = game.bidOrder.length > 0 ? game.bidOrder : game.playerIds;
  const bids = latestBids(game);

  // --- Escena ---
  let stage: ReactNode;
  if (result) {
    stage = <Panel variant="cream" as="section" aria-label={`Resultado de la ronda ${game.roundNumber}`} className={cx(b.scene)} bodyClassName={cx(b.sceneBody)}>
      <AuctionAward tone={result.success ? 'won' : 'unsold'} kicker={result.success ? `Ronda ${game.roundNumber} · Cumplió` : `Ronda ${game.roundNumber} · Farol`}
        title={bluffResultTitle(result, nameOf)} detail={`Apostó ${amountText(result.bid, UNIT)}`} fresh />
      <ResultScene result={result} nameOf={nameOf} avatar={avatarOf(result.bidderId, 'lg')} />
    </Panel>;
  } else if (searching && game.bidderId) {
    stage = <Panel variant="cream" as="section" aria-label={`Demostración de la ronda ${game.roundNumber}`} className={cx(b.scene)} bodyClassName={cx(b.sceneBody)}>
      <div className={b.sceneGrid}>
        <div className={b.sceneCondition}>
          <span className={b.kicker}>Condición de la ronda</span>
          <Condition description={game.condition?.description ?? ''} clauses={game.condition?.clauses ?? []} />
        </div>
        <div className={b.figures}>
          <div className={b.bidder} data-testid="bluff-bidder">
            {avatarOf(game.bidderId, 'lg')}
            <span className={b.bidderText}>
              <span className={b.kicker}>Demostrando</span>
              <strong className={b.bidderName} title={nameOf(game.bidderId)}>{game.bidderId === selfId ? 'Tú' : nameOf(game.bidderId)}</strong>
              <span className={b.bidderBid}>{`Apostó ${amountText(game.targetBid ?? 0, UNIT)}`}</span>
            </span>
          </div>
          <Metrics correct={game.correctCount} incorrect={game.incorrectCount} target={game.targetBid ?? 0} />
        </div>
      </div>
    </Panel>;
  } else {
    stage = <AuctionLot kicker={`Ronda ${Math.max(1, game.roundNumber)} · condición`} className={b.lot} unit={UNIT} emptyText="Preparando la primera ronda…"
      item={game.condition && <Condition description={game.condition.description} clauses={game.condition.clauses} />}
      facts={game.condition && <span className={b.rule}>{PASS_RULE}</span>}
      currentBid={game.currentBid} minimumBid={game.minimumBid} maximumBid={game.maxBid}
      leader={game.currentBidderId ? { name: nameOf(game.currentBidderId), self: game.currentBidderId === selfId, avatar: avatarOf(game.currentBidderId) } : null}
      order={bluffTurnOrder(game, selfId, nameOf)} />;
  }

  // --- Lateral ---
  const table: BudgetEntry[] = order.map((id, index) => {
    const status = bluffSeatStatus(game, id);
    const member = members.get(id);
    const passed = game.passedPlayerIds.includes(id);
    const bid = bids.get(id);
    return {
      id, name: nameOf(id), budget: null, color: colorOf(id), self: id === selfId,
      disconnected: member?.presence !== undefined && member.presence !== 'CONNECTED',
      avatar: avatarOf(id),
      status: { tone: SEAT_TONE[status], text: SEAT_STATUS_TEXT[status], icon: SEAT_ICON[status] },
      detail: `Orden ${index + 1} · ${game.scores[id] ?? 0} pts`,
      value: passed && game.phase === 'ROUND_ACTIVE' ? <span>Pasó</span> : bid !== undefined ? <><strong>{bid}</strong><small>{UNIT}</small></> : <span aria-label="Sin pujas">—</span>,
    };
  });
  const tablePlate = <BudgetPlate title="Mesa de pujas" entries={table} badge={`${order.length} ${order.length === 1 ? 'jugador' : 'jugadores'}`} />;
  let side: ReactNode;
  if (result) side = <><RoundPoints result={result} order={order} selfId={selfId} nameOf={nameOf} colorOf={colorOf} avatarOf={avatarOf} /><AttemptsPanel attempts={result.attempts} /></>;
  else if (searching) side = <>{tablePlate}<AttemptsPanel attempts={game.attempts} /></>;
  else side = <>{tablePlate}<BidHistory title="Pujas de la ronda" idBase="bluff-auction-history" views={[{ key: 'round', label: 'Pujas de la ronda', entries: bidLog(game.bidHistory, nameOf, { colorOf, selfId, unit: UNIT }), emptyText: 'Aún no hay pujas en esta ronda.' }]} /></>;

  // --- Abajo ---
  let bottom: ReactNode;
  if (result) {
    const verdict = bluffSelfVerdict(result, selfId, player?.role === 'PLAYER');
    bottom = <GuessPanel kind="reveal" titleRef={titleRef} question="" content={{
      icon: verdict.tone === 'ok' ? CheckCircle2 : verdict.tone === 'bad' ? X : Eye, tone: verdict.tone, kicker: verdict.text, title: 'Resultado de la ronda',
      text: game.roundNumber >= game.totalRounds ? 'Era la última ronda: después, la clasificación.' : 'La siguiente ronda empieza en un momento.',
      ...(verdict.points > 0 ? { aside: <strong className={b.plateAside}>{`+${verdict.points}`}</strong> } : {}),
    }} />;
  } else if (searching && game.bidderId) {
    const bidder = game.bidderId === selfId;
    bottom = canSearch
      ? <GuessPanel kind="guess" titleRef={titleRef} question="Nombra Pokémon" content={{ icon: Search, tone: 'info', kicker: `Tu demostración · ${game.correctCount} de ${game.targetBid ?? 0}`, title: 'Nombra Pokémon', text: TIME_RULE }}
        selector={{ pokemon: pool.pokemon, loading: pool.loading, loadError: pool.error, onRetry: pool.retry, inputLabel: 'Buscar Pokémon para demostrar la apuesta', maxResults: 5, roundKey: game.roundNumber, onGuess: (pokemonId) => onAction({ type: 'SUBMIT_POKEMON', pokemonId }) }} />
      : <GuessPanel kind="watching" titleRef={titleRef} question="" content={{
        icon: bidder ? Clock3 : Eye, tone: 'info', kicker: bidder ? 'Tu demostración' : 'Demostración',
        title: bidder ? 'Reconectando con la demostración…' : `${nameOf(game.bidderId)} está buscando`, text: 'Todos veis los intentos en tiempo real.',
      }} />;
  } else {
    bottom = <BidControls titleRef={titleRef} block={block} min={game.minimumBid} max={game.maxBid} unit={UNIT} epoch={epoch} allIn={false} passLabel="Pasar esta ronda"
      confirmPass={{ title: '¿Pasar esta ronda?', text: 'Quedarás fuera de esta ronda.', confirmLabel: 'Pasar' }}
      onBid={(amount) => onAction({ type: 'RAISE_BID', amount })} onPass={() => onAction({ type: 'PASS_BID' })} />;
  }

  const timer = result
    ? { deadline: game.nextTransitionAt ?? null, serverOffset: offset, label: bluffResultTimerLabel(game) }
    : searching
      ? { deadline: game.roundEndsAt ?? null, serverOffset: offset, label: 'Tiempo restante' }
      : { deadline: game.roundEndsAt ?? null, serverOffset: offset, label: bluffTimerLabel(game, selfId, nameOf), ...(bidSeconds > 0 ? { totalMs: bidSeconds * 1_000 } : {}) };
  return <AuctionScreen gameName={GAME_NAME} roundNumber={Math.max(1, game.roundNumber)} totalRounds={game.totalRounds} roundLabel={bluffRoundLabel(game)}
    heading={bluffHeading(game, selfId, nameOf)}
    meta={<><Chip tone="info" icon={<Icon icon={Mic2} size={18} />}>Bluff por voz externa</Chip>{!result && !searching && bidSeconds === 0 && <Chip tone="neutral">Sin límite de tiempo</Chip>}</>}
    pinBottom={!(searching && canSearch)} timer={timer} announcement={bluffAnnouncement(game, selfId, nameOf)} stage={stage} side={side} bottom={bottom} />;
}

/** Escena del resultado: la condición, quién apostó, por qué acabó así y las métricas finales. */
function ResultScene({ result, nameOf, avatar }: { result: BluffAuctionRoundResult; nameOf: (id: string) => string; avatar: ReactNode }) {
  return <div className={b.sceneGrid}>
    <div className={b.sceneCondition}>
      <span className={b.kicker}>Condición de la ronda</span>
      <Condition description={result.condition.description} clauses={result.condition.clauses} />
    </div>
    <div className={b.figures}>
      <div className={b.bidder} data-testid="bluff-bidder">
        {avatar}
        <span className={b.bidderText}>
          <span className={b.kicker}>{result.success ? 'Cumplió su apuesta' : 'Farol'}</span>
          <strong className={b.bidderName} title={nameOf(result.bidderId)}>{nameOf(result.bidderId)}</strong>
          <span className={b.bidderBid}>{`Apostó ${amountText(result.bid, UNIT)}`}</span>
        </span>
      </div>
      <p className={b.reason} data-testid="bluff-reason">{bluffResultReason(result, nameOf)}</p>
      <Metrics correct={result.correctCount} incorrect={result.incorrectCount} target={result.bid} />
    </div>
  </div>;
}

/** Puntos de la ronda (columna lateral): quien apostó («Cumplió» o «Farol») y cada rival, con lo que suma. */
function RoundPoints({ result, order, selfId, nameOf, colorOf, avatarOf }: { result: BluffAuctionRoundResult; order: readonly string[]; selfId: string; nameOf(id: string): string; colorOf(id: string): string; avatarOf(id: string): ReactNode }) {
  return <Panel title="Puntos de la ronda" variant="dark" scroll scrollLabel="Puntos de la ronda">
    <ol className={b.rows} aria-label="Resultado de cada jugador">{bluffRoundLines(result, order).map((line) => <li key={line.playerId} data-testid="bluff-round-row" data-role={line.role}>
      <Row name={nameOf(line.playerId)} color={colorOf(line.playerId)} self={line.playerId === selfId} avatar={avatarOf(line.playerId)}
        meta={<span className={b.rowMeta}>
          <Chip tone={line.tone} icon={<Icon icon={line.tone === 'ok' ? CheckCircle2 : line.tone === 'bad' ? XCircle : Eye} size={18} />}>{line.text}</Chip>
          <span className={b.note}>{line.role === 'bidder' ? `Apostó ${amountText(result.bid, UNIT)}` : 'Rival'}</span>
        </span>}
        value={<span className={b.points}>{`+${line.points}`}</span>} />
    </li>)}</ol>
  </Panel>;
}
