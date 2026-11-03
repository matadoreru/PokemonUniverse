import type { PokemonType } from '@pokemon-universe/shared/public';
import { PokemonTypeBadge as TypeBadge } from '../components/PokemonTypeBadge';
import { typeDuelSolutionsText } from './type-duel-result';

export interface TypeDuelDuelist { id: string; name: string; type: PokemonType | undefined }

/**
 * Enfrentamiento al revelar los tipos: cada duelista entra por su lado y el «VS» rebota entre ellos.
 * En móvil es más compacto para que, durante la búsqueda, el campo y los primeros candidatos quepan sin desplazar.
 */
export function TypeDuelVersus({ duelists, requiredTypes, solutionCount }: { duelists: readonly [TypeDuelDuelist, TypeDuelDuelist]; requiredTypes: readonly PokemonType[] | null; solutionCount: number | null }) {
  const [first, second] = duelists;
  return <div className="mb-3 rounded-2xl border border-aqua bg-aqua/10 p-3 text-center sm:mb-5 sm:p-4" data-testid="type-duel-versus">
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
      <Duelist duelist={first} className="motion-enter-left sm:items-end sm:text-right" />
      <span className="font-display text-3xl font-bold text-berry motion-bump sm:text-4xl">VS</span>
      <Duelist duelist={second} className="motion-enter-right sm:items-start sm:text-left" />
    </div>
    {solutionCount !== null && <p className="mt-2 font-display text-lg font-bold tabular-nums sm:mt-4 sm:text-xl">{typeDuelSolutionsText(solutionCount)}</p>}
    {requiredTypes && (requiredTypes.length === 1
      // Mismo tipo en los dos lados: los badges ya lo dicen, solo falta aclarar que es un monotipo exacto.
      ? <p className="mt-1 font-bold sm:mt-2"><span className="chip">Monotipo</span></p>
      : <div className="mt-2 flex flex-wrap items-center justify-center gap-2 font-bold"><span>Objetivo exacto:</span>{requiredTypes.map((type) => <TypeBadge key={type} type={type} compact />)}</div>)}
  </div>;
}

function Duelist({ duelist, className }: { duelist: TypeDuelDuelist; className: string }) {
  return <div className={`flex min-w-0 flex-col items-center gap-1.5 sm:gap-2 ${className}`}>
    <strong className="block max-w-full truncate font-display text-lg sm:text-xl" title={duelist.name}>{duelist.name}</strong>
    {duelist.type && <TypeBadge type={duelist.type} />}
  </div>;
}
