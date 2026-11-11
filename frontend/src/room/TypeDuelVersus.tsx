import type { PokemonType } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS } from '@pokemon-universe/shared/public';
import type { CSSProperties, ReactNode } from 'react';
import { Chip, cx, TypeBadge } from '../ui';
import { typeDuelSolutionsText } from './type-duel-result';
import s from '../games/type-duel/TypeDuel.module.css';

export interface TypeDuelDuelist { id: string; name: string; type: PokemonType | undefined; /** Avatar del duelista (decorativo: el nombre va escrito). */ avatar?: ReactNode }

/**
 * Losa del enfrentamiento al revelar los tipos: cada mitad teñida con el tipo de su duelista, que entra por su lado
 * (`motion-enter-left/right`), y el disco «VS» que rebota (`motion-bump`) en medio. Debajo, cuántos Pokémon cumplen la
 * combinación y el objetivo exacto («Monotipo» si los dos eligieron el mismo). Con `impossible`, la losa va en rojo y
 * lleva ese aviso en lugar del recuento. En el móvil es compacta para que el buscador quepa debajo.
 */
export function TypeDuelVersus({ duelists, requiredTypes, solutionCount, impossible }: { duelists: readonly [TypeDuelDuelist, TypeDuelDuelist]; requiredTypes: readonly PokemonType[] | null; solutionCount: number | null; impossible?: ReactNode }) {
  const [first, second] = duelists;
  const tint = (type: PokemonType | undefined) => type ? `var(--type-${type})` : 'var(--navy-3)';
  const style = { '--left-type': tint(first.type), '--right-type': tint(second.type) } as CSSProperties;
  return <div className={cx(s.versus, impossible != null && s.versusImpossible)} style={style} data-testid="type-duel-versus" data-state={impossible != null ? 'impossible' : 'revealed'}>
    <div className={s.versusRow}>
      <Duelist duelist={first} className={cx(s.duelistLeft, 'motion-enter-left')} />
      <span className={cx(s.vsDisc, 'motion-bump')}><span className="ol">VS</span></span>
      <Duelist duelist={second} className={cx(s.duelistRight, 'motion-enter-right')} />
    </div>
    <div className={s.versusFoot}>
      {solutionCount !== null && <p className={s.solutions}>{typeDuelSolutionsText(solutionCount)}</p>}
      {requiredTypes && (requiredTypes.length === 1
        // Mismo tipo en los dos lados: las insignias ya lo dicen, solo falta aclarar que es un monotipo exacto.
        ? <Chip tone="warn">Monotipo</Chip>
        : <span className={s.target}><span>Objetivo exacto:</span>{requiredTypes.map((type) => <TypeBadge key={type} type={type} label={POKEMON_TYPE_LABELS[type]} size="sm" />)}</span>)}
      {impossible}
    </div>
  </div>;
}

function Duelist({ duelist, className }: { duelist: TypeDuelDuelist; className: string }) {
  return <div className={cx(s.duelist, className)}>
    {duelist.avatar && <span className={s.duelistAvatar} aria-hidden="true">{duelist.avatar}</span>}
    <strong className={cx(s.duelistName, 'ol')} title={duelist.name}>{duelist.name}</strong>
    {duelist.type && <TypeBadge type={duelist.type} label={POKEMON_TYPE_LABELS[duelist.type]} size="lg" />}
  </div>;
}
