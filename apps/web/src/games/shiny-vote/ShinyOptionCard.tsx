import type { RoomMemberView, ShinyOption } from '@pokemon-universe/shared';
import { Check, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const imageSource = (source: string) => source.startsWith('/api/') ? `${API_ORIGIN}${source}` : source;

function PokemonSprite({ option }: { option: ShinyOption }) {
  const [loaded, setLoaded] = useState(false);
  return <span className="shiny-sprite-stage relative grid w-full place-items-center" aria-hidden="true">
    {!loaded && <LoaderCircle className="absolute animate-spin text-aqua" size={32} />}
    <img
      className={`shiny-sprite absolute inset-0 m-auto h-full w-full object-contain transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      src={imageSource(option.sprite)}
      alt=""
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  </span>;
}

function VoterSummary({ optionId, voters }: { optionId: ShinyOption['id']; voters: RoomMemberView[] }) {
  const visible = voters.slice(0, 3);
  const hidden = voters.length - visible.length;
  return <span className="mt-2 flex min-h-7 w-full items-center justify-center gap-2 border-t border-ink/10 pt-2 text-xs font-extrabold text-ink/65" data-testid={`shiny-voters-${optionId}`}>
    <span className="flex -space-x-1.5" aria-hidden="true">{visible.map((member) => <Avatar key={member.id} name={member.displayName} avatar={member.avatar} size="xs" className="ring-2 ring-surface-raised" />)}</span>
    {hidden > 0 && <span className="text-ink/55">+{hidden}</span>}
    <span>{voters.length} {voters.length === 1 ? 'voto' : 'votos'}</span>
  </span>;
}

export function ShinyOptionCard({ option, voters, selected, confirmed, disabled, reveal, correct, showVoters, onSelect }: {
  option: ShinyOption;
  voters: RoomMemberView[];
  selected: boolean;
  confirmed: boolean;
  disabled: boolean;
  reveal: boolean;
  correct: boolean;
  showVoters: boolean;
  onSelect(): void;
}) {
  const selectedWrong = reveal && selected && !correct;
  const tone = reveal
    ? correct
      ? 'shiny-option-correct border-leaf bg-surface'
      : selectedWrong
        ? 'border-berry/55 bg-surface opacity-90'
        : 'border-ink/10 bg-surface opacity-60'
    : selected
      ? 'shiny-option-selected border-aqua bg-surface'
      : confirmed
        ? 'border-ink/10 bg-surface opacity-60'
        : 'border-ink/15 bg-surface';
  const stateLabel = reveal
    ? correct ? 'Shiny verdadero' : selectedWrong ? 'Tu elección' : 'Incorrecta'
    : selected ? confirmed ? 'Tu voto' : 'Seleccionado' : null;
  const stateIcon = reveal && !correct ? <X size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />;
  const ariaState = reveal
    ? correct ? ', shiny verdadero' : selectedWrong ? ', tu elección incorrecta' : ', opción incorrecta'
    : selected ? confirmed ? ', voto confirmado' : ', seleccionada' : '';

  return <button
    type="button"
    disabled={disabled}
    aria-pressed={selected}
    aria-label={`Opción ${option.id}: ${option.pokemonName}${ariaState}`}
    aria-keyshortcuts={`${option.id} ${option.id.charCodeAt(0) - 64}`}
    data-shiny-option={option.id}
    onClick={onSelect}
    className={`shiny-option-card relative flex min-w-0 flex-col items-center overflow-hidden rounded-2xl border-2 p-2.5 text-center shadow-card sm:p-3 ${!disabled ? 'shiny-option-interactive cursor-pointer' : 'cursor-default'} ${tone}`}
  >
    <span className="flex w-full items-center justify-between gap-2">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border font-display text-base font-bold sm:h-9 sm:w-9 sm:text-lg ${selected || (reveal && correct) ? 'border-electric bg-electric text-night shadow-[0_2px_10px_rgba(240,191,84,.18)]' : 'border-electric/55 bg-electric/15 text-electric'}`}>{option.id}</span>
      {stateLabel && <span className={`shiny-option-state inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-[.68rem] font-black sm:text-xs ${reveal ? correct ? 'bg-leaf/15 text-leaf' : 'bg-berry/10 text-berry' : 'bg-aqua/[.12] text-aqua'}`}>{stateIcon}<span className="truncate">{stateLabel}</span></span>}
    </span>
    <PokemonSprite key={option.sprite} option={option} />
    <strong className="w-full truncate px-1 font-display text-base font-bold text-ink/85 sm:text-lg" title={option.pokemonName}>{option.pokemonName}</strong>
    {showVoters && voters.length > 0 && <VoterSummary optionId={option.id} voters={voters} />}
  </button>;
}
