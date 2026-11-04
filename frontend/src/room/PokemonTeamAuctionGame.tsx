import type { PokemonTeamAuctionConfig, PokemonTeamAuctionPlayerState, PokemonTeamAuctionPublicState, RoomView } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Clock3, Coins, Crown, Eye, Gavel, Hourglass, Lock, PackageCheck, SkipForward } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import {
  currentLotEvents, PASS_RULE, TEAM_SIZE, TEAM_STATUS_TEXT, teamAnnouncement, teamAward, teamBlockInput, teamBst, teamHeading, teamStatus, type TeamStatus,
} from '../games/pokemon-team-auction/presentation';
import { PokemonFacts, TeamDialog, TeamStrip } from '../games/pokemon-team-auction/TeamParts';
import { useSfxCue } from '../hooks/useSfxCue';
import { useServerOffset } from '../hooks/useServerTime';
import { Card, Chip, Icon, Pill, type ChipProps } from '../ui';
import {
  AuctionAward, AuctionLot, AuctionScreen, BidControls, BidHistory, BudgetPlate, bidBlock, bidEpoch, bidLog, type BidLogEntry, type BudgetEntry,
} from './auction-kit';
import { useFocusOnTransition } from './focus-transition';
import { playerColor } from './player-color';
import s from '../games/pokemon-team-auction/TeamAuction.module.css';

const GAME_NAME = 'Pokémon Team Auction';
const STATUS_ICON: Record<TeamStatus, LucideIcon> = { turn: Gavel, leading: Crown, passed: SkipForward, full: PackageCheck, noBudget: Coins, bidding: Hourglass, closed: Lock };
const STATUS_TONE: Record<TeamStatus, NonNullable<ChipProps['tone']>> = { turn: 'warn', leading: 'ok', passed: 'neutral', full: 'ok', noBudget: 'bad', bidding: 'neutral', closed: 'neutral' };

type GameAction = (action: unknown, options?: { report?: boolean }) => Promise<void>;

/**
 * Pokémon Team Auction con el kit de subasta (spec §2 y §6 «Juegos»): arriba, la placa del lote («Lote N de M», de quién
 * es el turno y su plazo) y el lote en una `Card` con su BST, la puja actual, quién va ganando y la siguiente mínima,
 * con la banda de la última adjudicación encima. Abajo, los controles de la puja con el presupuesto propio. Al lado,
 * los presupuestos y equipos de todos (cada equipo se abre en un `Dialog`) y el historial: las pujas del lote y los
 * lotes cerrados.
 *
 * Privacidad: la subasta es visible; el motor publica pujas, monedas y equipos de todos y la pantalla no pinta nada más.
 */
export function PokemonTeamAuctionGame({ room, selfId, onAction }: { room: RoomView; selfId: string; onAction: GameAction }) {
  const game = room.game as PokemonTeamAuctionPublicState;
  const player = room.gamePlayerState as PokemonTeamAuctionPlayerState | null;
  const config = room.selectedGameConfig as Partial<PokemonTeamAuctionConfig> | null;
  const offset = useServerOffset(room.serverNow);
  useSfxCue(game.currentBid != null ? 'game.bid' : null, `${game.lotNumber}:${game.currentBid ?? ''}`);

  const members = useMemo(() => new Map(room.members.map((member, index) => [member.id, { member, index }])), [room.members]);
  const nameOf = (id: string) => members.get(id)?.member.displayName ?? 'Entrenador';
  const colorOf = (id: string) => playerColor(members.get(id)?.index ?? 0);
  const [teamOf, setTeamOf] = useState<string | null>(null);

  const block = bidBlock(teamBlockInput(game, player, selfId, nameOf));
  const epoch = bidEpoch(game.lotNumber, game.bidHistory.length);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Cambia con el lote y con el estado propio (al pujar, la placa pasa a «Ya vas ganando» y el botón se deshabilita).
  useFocusOnTransition(`${game.phase}-${game.lotNumber}-${block.reason}`, titleRef);

  const pokemon = game.phase === 'ROUND_ACTIVE' ? game.currentPokemon : null;
  const lotNumber = Math.min(Math.max(1, game.lotNumber), game.totalLots);
  const award = teamAward(game, nameOf);
  const bidSeconds = config?.bidSeconds ?? 20;
  const leader = game.currentBidderId ? members.get(game.currentBidderId) : undefined;
  const turnText = game.currentTurnPlayerId ? (game.currentTurnPlayerId === selfId ? 'Tu turno' : `Turno de ${nameOf(game.currentTurnPlayerId)}`) : null;

  const stage = <AuctionLot kicker={`Lote ${lotNumber} · en subasta`}
    item={pokemon && <Card size="fill" sprite={pokemon.sprite} name={pokemon.name} decorativeSprite eager attrs={{ 'data-testid': 'auction-pokemon' }}><PokemonFacts pokemon={pokemon} /></Card>}
    currentBid={game.currentBid} minimumBid={game.minimumBid}
    leader={game.currentBidderId ? { name: nameOf(game.currentBidderId), self: game.currentBidderId === selfId, avatar: <Avatar name={nameOf(game.currentBidderId)} avatar={leader?.member.avatar} size="sm" /> } : null}
    turn={turnText && <span className={s.turn}><Icon icon={Clock3} size={18} />{turnText}</span>}
    award={award && <AuctionAward {...award} />} />;

  const order = game.turnOrder.length > 0 ? game.turnOrder : Object.keys(game.participants);
  const budgets: BudgetEntry[] = order.flatMap((id) => {
    const participant = game.participants[id];
    if (!participant) return [];
    const status = teamStatus(game, id);
    const entry = members.get(id);
    const name = nameOf(id);
    return [{
      id, name, budget: participant.coins, color: colorOf(id), self: id === selfId,
      disconnected: entry?.member.presence !== undefined && entry.member.presence !== 'CONNECTED',
      status: { tone: STATUS_TONE[status], text: TEAM_STATUS_TEXT[status], icon: STATUS_ICON[status] },
      detail: <><span>{`Equipo ${participant.team.length}/${TEAM_SIZE} · BST ${teamBst(participant.team)}`}</span><TeamStrip team={participant.team} /></>,
      action: <Pill size="round" variant="blue" icon={Eye} aria-label={id === selfId ? 'Ver tu equipo' : `Ver equipo de ${name}`} data-testid="team-open" onClick={() => setTeamOf(id)} />,
    }];
  });

  const lotEntries = bidLog(currentLotEvents(game), nameOf, { colorOf, selfId });
  const closedEntries: BidLogEntry[] = game.lotHistory.map((lot, index): BidLogEntry => ({
    key: `lot-${lot.lotNumber}`,
    name: lot.pokemon.name,
    sprite: lot.pokemon.sprite,
    text: lot.winnerId ? `Lote ${lot.lotNumber} · ${nameOf(lot.winnerId)}` : `Lote ${lot.lotNumber} · Sin dueño`,
    tone: lot.winnerId ? 'win' : 'none',
    ...(lot.winnerId ? { value: String(lot.bid), color: colorOf(lot.winnerId), self: lot.winnerId === selfId } : {}),
    fresh: index === game.lotHistory.length - 1,
  })).reverse();
  const side = <>
    <BudgetPlate title="Presupuestos y equipos" entries={budgets} note={PASS_RULE} />
    <BidHistory title="Historial" idBase="team-auction-history" views={[
      { key: 'lot', label: 'Este lote', entries: lotEntries, emptyText: 'Aún no hay pujas en este lote.' },
      { key: 'closed', label: 'Cerrados', badge: `${game.lotHistory.length}/${game.totalLots}`, entries: closedEntries, emptyText: 'Aún no se ha cerrado ningún lote.' },
    ]} />
  </>;

  const bottom = <BidControls titleRef={titleRef} block={block} min={game.minimumBid} max={player?.coins ?? 0} epoch={epoch}
    budget={player?.role === 'PLAYER' ? player.coins : null} passLabel="Pasar este Pokémon"
    onBid={(amount) => onAction({ type: 'RAISE_BID', amount })} onPass={() => onAction({ type: 'PASS_BID' })} />;

  const shown = teamOf ? game.participants[teamOf] : undefined;
  return <>
    <AuctionScreen gameName={GAME_NAME} roundNumber={lotNumber} totalRounds={game.totalLots} roundLabel={`Lote ${lotNumber} de ${game.totalLots}`}
      heading={teamHeading(game, selfId, nameOf)}
      meta={<><Chip tone="info" icon={<Icon icon={Eye} size={18} />}>Subasta ascendente visible</Chip>{bidSeconds === 0 && <Chip tone="neutral">Sin límite de tiempo</Chip>}</>}
      timer={{ deadline: game.roundEndsAt ?? null, serverOffset: offset, label: 'Turno de puja', ...(bidSeconds > 0 ? { totalMs: bidSeconds * 1_000 } : {}) }}
      announcement={teamAnnouncement(game, selfId, nameOf)} stage={stage} side={side} bottom={bottom} />
    <TeamDialog open={Boolean(teamOf && shown)} name={teamOf === selfId ? 'Tu equipo' : `Equipo de ${teamOf ? nameOf(teamOf) : ''}`} team={shown?.team ?? []} coins={shown?.coins ?? 0} onClose={() => setTeamOf(null)} />
  </>;
}
