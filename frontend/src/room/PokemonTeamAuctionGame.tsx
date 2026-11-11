import type { PokemonTeamAuctionConfig, PokemonTeamAuctionPlayerState, PokemonTeamAuctionPublicState } from '@pokemon-universe/shared/public';
import type { LucideIcon } from 'lucide-react';
import { Coins, Crown, Eye, Hourglass, Lock, PackageCheck, SkipForward } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  currentLotEvents, PASS_RULE, TEAM_SIZE, TEAM_STATUS_TEXT, teamAnnouncement, teamBlockInput, teamBst, teamHeading, teamPrevious, teamStatus, teamTimerLabel, teamTurnOrder, type TeamStatus,
} from '../games/pokemon-team-auction/presentation';
import { PokemonFacts, TeamDialog, TeamStrip } from '../games/pokemon-team-auction/TeamParts';
import { useSfxCue } from '../hooks/useSfxCue';
import { useServerOffset } from '../hooks/useServerTime';
import { Card, Chip, Pill, type ChipProps } from '../ui';
import {
  AuctionLot, AuctionPrevious, AuctionScreen, BidControls, BidHistory, BudgetPlate, bidBlock, bidEpoch, bidLog, type BidLogEntry, type BudgetEntry,
} from './auction-kit';
import { useFocusOnTransition } from './focus-transition';
import { playerColor } from './player-color';
import type { ActiveGameProps } from './room-command';

const GAME_NAME = 'Pokémon Team Auction';
const STATUS_ICON: Record<TeamStatus, LucideIcon> = { leading: Crown, passed: SkipForward, full: PackageCheck, noBudget: Coins, bidding: Hourglass, closed: Lock };
const STATUS_TONE: Record<TeamStatus, NonNullable<ChipProps['tone']>> = { leading: 'ok', passed: 'neutral', full: 'ok', noBudget: 'bad', bidding: 'neutral', closed: 'neutral' };

/**
 * Pokémon Team Auction con el kit de subasta (spec §2 y §6 «Juegos»): arriba, la placa con el lote como título
 * («Lote 2 de 18 · Liepard») y el turno solo en el reloj («Turno de Ana · 13»); el lote en una `Card` y, al lado, una
 * sola tarjeta con el estado de la puja (cifra y quién gana, el mínimo para superarla y el orden de turno), con la línea
 * del lote anterior encima. Abajo, en tu turno, los controles de la puja; si no, el mensaje de a quién le toca y cómo va
 * (sin botones grises); el presupuesto propio siempre. Al lado, los presupuestos y equipos de todos (cada equipo se abre
 * en un `Dialog`) y el historial: las pujas del lote y los lotes cerrados.
 *
 * Privacidad: la subasta es visible; el motor publica pujas, monedas y equipos de todos y la pantalla no pinta nada más.
 * El BST del lote en subasta no llega (se juzga sin él); el de los equipos, sí.
 */
export function PokemonTeamAuctionGame({ room, selfId, onAction }: ActiveGameProps) {
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
  const previous = teamPrevious(game, nameOf);
  const bidSeconds = config?.bidSeconds ?? 20;

  const stage = <AuctionLot kicker="En subasta"
    item={pokemon && <Card size="fill" sprite={pokemon.sprite} name={pokemon.name} decorativeSprite eager attrs={{ 'data-testid': 'auction-pokemon' }}><PokemonFacts pokemon={pokemon} /></Card>}
    currentBid={game.currentBid} minimumBid={game.minimumBid}
    leader={game.currentBidderId ? { name: nameOf(game.currentBidderId), self: game.currentBidderId === selfId } : null}
    order={teamTurnOrder(game, selfId, nameOf)}
    previous={previous && <AuctionPrevious {...previous} />} />;

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
    {/* El lote ya va en el título: la insignia dice el modo («Pujas a la vista»: todos ven cada puja). */}
    <AuctionScreen gameName={GAME_NAME} roundNumber={lotNumber} totalRounds={game.totalLots} roundLabel="Pujas a la vista"
      heading={teamHeading(game)}
      meta={bidSeconds === 0 ? <Chip tone="neutral">Sin límite de tiempo</Chip> : null}
      timer={{ deadline: game.roundEndsAt ?? null, serverOffset: offset, label: teamTimerLabel(game, selfId, nameOf), ...(bidSeconds > 0 ? { totalMs: bidSeconds * 1_000 } : {}) }}
      announcement={teamAnnouncement(game, selfId, nameOf)} stage={stage} side={side} bottom={bottom} />
    <TeamDialog open={Boolean(teamOf && shown)} name={teamOf === selfId ? 'Tu equipo' : `Equipo de ${teamOf ? nameOf(teamOf) : ''}`} team={shown?.team ?? []} coins={shown?.coins ?? 0} onClose={() => setTeamOf(null)} />
  </>;
}
