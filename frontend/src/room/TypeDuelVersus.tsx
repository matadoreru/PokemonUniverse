import type { PokemonType } from '@pokemon-universe/shared/public';
import { PokemonTypeBadge as TypeBadge } from '../components/PokemonTypeBadge';
import { typeDuelSolutionsText } from './type-duel-result';

export interface TypeDuelDuelist { id: string; name: string; type: PokemonType | undefined }

/** Enfrentamiento al revelar los tipos: cada duelista entra por su lado y el «VS» rebota entre ellos. */
export function TypeDuelVersus({ duelists, requiredTypes, solutionCount }: { duelists: readonly [TypeDuelDuelist, TypeDuelDuelist]; requiredTypes: readonly PokemonType[] | null; solutionCount: number | null }) {
  const [first, second] = duelists;
  return <div className="mb-5 rounded-2xl border border-aqua bg-aqua/10 p-4 text-center" data-testid="type-duel-versus">
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
      <Duelist duelist={first} className="motion-enter-left sm:items-end sm:text-right" />
      <span className="font-display text-4xl font-bold text-berry motion-bump">VS</span>
      <Duelist duelist={second} className="motion-enter-right sm:items-start sm:text-left" />
    </div>
    {solutionCount !== null && <p className="mt-4 font-display text-xl font-bold tabular-nums">{typeDuelSolutionsText(solutionCount)}</p>}
    {requiredTypes && <div className="mt-2 flex flex-wrap items-center justify-center gap-2 font-bold"><span>Objetivo exacto:</span>{requiredTypes.map((type) => <TypeBadge key={type} type={type} compact />)}</div>}
  </div>;
}

function Duelist({ duelist, className }: { duelist: TypeDuelDuelist; className: string }) {
  return <div className={`flex min-w-0 flex-col items-center gap-2 ${className}`}>
    <strong className="block max-w-full truncate font-display text-xl" title={duelist.name}>{duelist.name}</strong>
    {duelist.type && <TypeBadge type={duelist.type} />}
  </div>;
}
