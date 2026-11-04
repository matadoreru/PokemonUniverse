import type { TeamAuctionPokemon } from '@pokemon-universe/shared/public';
import { Badge, Card, Chip, Dialog, StateBox } from '../../ui';
import { amountText } from '../../room/auction-kit';
import { legendaryLabel, TEAM_SIZE, teamBst } from './presentation';
import s from './TeamAuction.module.css';

/** Chips de un Pokémon del lote o del equipo: BST y, si lo es, «Legendario»/«Mítico» (en texto). */
export function PokemonFacts({ pokemon }: { pokemon: TeamAuctionPokemon }) {
  const legend = legendaryLabel(pokemon.legendaryStatus);
  return <span className={s.facts}><Chip tone="info">BST {pokemon.baseStatTotal}</Chip>{legend && <Badge>{legend}</Badge>}</span>;
}

/** Sprites pequeños (decorativos) de un equipo, para la franja de los presupuestos; los nombres van en el diálogo. */
export function TeamStrip({ team }: { team: readonly TeamAuctionPokemon[] }) {
  if (team.length === 0) return null;
  return <span className={s.strip} aria-hidden="true">{team.map((pokemon, index) => <img key={`${pokemon.id}-${index}`} src={pokemon.sprite} alt="" title={pokemon.name} />)}</span>;
}

/** Equipo de un jugador en una rejilla de cartas pequeñas con su BST; vacío: «Sin Pokémon todavía». */
export function TeamGrid({ team }: { team: readonly TeamAuctionPokemon[] }) {
  if (team.length === 0) return <StateBox kind="empty" title="Sin Pokémon todavía" onCream live={false} />;
  return <ul className={s.grid} aria-label="Pokémon del equipo">{team.map((pokemon, index) => <li key={`${pokemon.id}-${index}`}>
    <Card size="sm" sprite={pokemon.sprite} name={pokemon.name} decorativeSprite><PokemonFacts pokemon={pokemon} /></Card>
  </li>)}</ul>;
}

/**
 * Diálogo con el equipo de un jugador (se abre desde su franja en los presupuestos): resumen en texto (Pokémon, BST y
 * monedas) y las cartas. Es información pública.
 */
export function TeamDialog({ open, name, team, coins, onClose }: { open: boolean; name: string; team: readonly TeamAuctionPokemon[]; coins: number; onClose(): void }) {
  return <Dialog open={open} title={name} onClose={onClose} width={640} actions={[{ label: 'Cerrar', onClick: onClose, autoFocus: true }]}>
    <p className={s.dialogSummary} data-testid="team-dialog-summary">{`Equipo ${team.length}/${TEAM_SIZE} · BST ${teamBst(team)} · ${amountText(coins)}`}</p>
    <TeamGrid team={team} />
  </Dialog>;
}
