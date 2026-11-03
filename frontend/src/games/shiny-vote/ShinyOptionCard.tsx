import { pokemonSpritePath, type RoomMemberView, type ShinyOption } from '@pokemon-universe/shared/public';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ScorePop } from '../../components/ScorePop';
import { apiAsset } from '../../lib/api';
import { SHINY_BEFORE_AFTER } from './reveal';

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const imageSource = (source: string) => source.startsWith('/api/') ? `${API_ORIGIN}${source}` : source;

const ignoreSettled = () => undefined;

/** Sprite de la carta: la imagen se monta siempre (para que cargue) y el esqueleto la cubre hasta que la ronda está lista. */
function PokemonSprite({ option, loading, onSettled }: { option: ShinyOption; loading: boolean; onSettled(optionId: ShinyOption['id']): void }) {
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const markLoaded = () => {
    setLoaded(true);
    onSettled(option.id);
  };
  // Una imagen ya en caché (o rota) puede terminar antes de que React enganche onLoad/onError.
  useEffect(() => {
    if (!image.current?.complete) return;
    setLoaded(true);
    onSettled(option.id);
  }, [onSettled, option.id]);
  const visible = loaded && !loading;
  return <span className="shiny-sprite-stage relative grid w-full place-items-center" aria-hidden="true">
    {!visible && <span className="skeleton absolute inset-2" data-testid="shiny-card-skeleton" />}
    <img
      ref={image}
      className={`shiny-sprite absolute inset-0 m-auto h-full w-full object-contain transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
      src={imageSource(option.sprite)}
      alt=""
      onLoad={markLoaded}
      onError={markLoaded}
    />
  </span>;
}

function VoterSummary({ optionId, voters }: { optionId: ShinyOption['id']; voters: RoomMemberView[] }) {
  const visible = voters.slice(0, 3);
  const hidden = voters.length - visible.length;
  return <span className="mt-2 flex min-h-9 w-full items-center justify-center gap-2 border-t border-ink/10 pt-2 text-xs font-extrabold text-ink/65" data-testid={`shiny-voters-${optionId}`}>
    <span className="flex -space-x-2" aria-hidden="true">{visible.map((member) => <Avatar key={member.id} name={member.displayName} avatar={member.avatar} size="sm" className="ring-2 ring-surface-raised" />)}</span>
    {hidden > 0 && <span className="text-ink/55">+{hidden}</span>}
    <span>{voters.length} {voters.length === 1 ? 'voto' : 'votos'}</span>
  </span>;
}

export function ShinyOptionCard({ option, voters, selected, confirmed, disabled, loading = false, reveal, correct, showVoters, feedback = null, onSelect, onSettled }: {
  option: ShinyOption;
  voters: RoomMemberView[];
  selected: boolean;
  confirmed: boolean;
  disabled: boolean;
  /** Las cartas de la ronda aún no han cargado: esqueleto y sin voto. */
  loading?: boolean;
  reveal: boolean;
  correct: boolean;
  showVoters: boolean;
  /** Puntos de la ronda para la carta propia al revelar (`shinyRoundFeedback`). */
  feedback?: { tone: 'leaf' | 'berry'; label: string; points: number } | null;
  onSelect(): void;
  /** Avisa (una vez o más, debe ser idempotente) de que el sprite de la carta ha cargado o fallado. */
  onSettled?(optionId: ShinyOption['id']): void;
}) {
  const own = reveal && selected;
  const selectedWrong = own && !correct;
  const tone = reveal
    ? correct
      ? 'shiny-option-correct motion-flip border-leaf bg-surface'
      : selectedWrong
        ? 'shiny-option-static border-berry bg-surface'
        : 'shiny-option-static border-ink/10 bg-surface opacity-60 grayscale'
    : selected
      ? 'shiny-option-selected border-aqua bg-surface'
      : confirmed
        ? 'border-ink/10 bg-surface opacity-60'
        : 'border-ink/15 bg-surface';
  const stateLabel = reveal
    ? correct ? own ? 'Tu voto' : 'Shiny verdadero' : selectedWrong ? 'Tu voto' : 'Incorrecta'
    : selected ? confirmed ? 'Tu voto' : 'Seleccionado' : null;
  const stateIcon = reveal && !correct ? <X size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />;
  const ariaState = reveal
    ? correct ? own ? ', shiny verdadero, tu voto acertado' : ', shiny verdadero' : selectedWrong ? ', tu voto, incorrecta' : ', opción incorrecta'
    : selected ? confirmed ? ', voto confirmado' : ', seleccionada' : '';
  const ariaPoints = own && feedback ? `, ${feedback.label} puntos` : '';

  return <button
    type="button"
    disabled={disabled || loading}
    aria-pressed={selected}
    aria-label={`Opción ${option.id}: ${option.pokemonName}${ariaState}${ariaPoints}`}
    aria-keyshortcuts={`${option.id} ${option.id.charCodeAt(0) - 64}`}
    data-shiny-option={option.id}
    data-correct={reveal && correct ? 'true' : undefined}
    onClick={onSelect}
    className={`shiny-option-card relative flex min-w-0 flex-col items-center overflow-hidden rounded-2xl border-2 p-2.5 text-center shadow-card sm:p-3 ${!disabled && !loading ? 'shiny-option-interactive cursor-pointer' : 'cursor-default'} ${tone}`}
  >
    <span className="flex w-full items-center justify-between gap-2">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border font-display text-base font-bold sm:h-9 sm:w-9 sm:text-lg ${selected || (reveal && correct) ? 'border-electric bg-electric text-night' : 'border-electric/55 bg-electric/15 text-electric'}`}>{option.id}</span>
      {own && feedback && <ScorePop key={`${option.id}|${feedback.label}`} points={feedback.points} tone={feedback.tone} />}
      {stateLabel && <span className={`shiny-option-state inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${reveal ? correct ? 'bg-leaf/15 text-leaf' : 'bg-berry/10 text-berry' : 'bg-aqua/[.12] text-aqua'}`}>
        {reveal && correct ? <span className="motion-enter-up" aria-hidden="true" data-testid="shiny-sparkle">✨</span> : stateIcon}
        {reveal && correct && !own
          ? <><span className="sm:hidden">Shiny</span><span className="max-sm:hidden truncate" title={stateLabel}>{stateLabel}</span></>
          : <span className="truncate" title={stateLabel}>{stateLabel}</span>}
      </span>}
    </span>
    <PokemonSprite key={option.sprite} option={option} loading={loading} onSettled={onSettled ?? ignoreSettled} />
    <strong className="w-full truncate px-1 font-display text-base font-bold text-ink/85 sm:text-lg" title={option.pokemonName}>{option.pokemonName}</strong>
    {showVoters && voters.length > 0 && <VoterSummary optionId={option.id} voters={voters} />}
  </button>;
}

/** Franja de la revelación: el sprite normal (proxy de la Pokédex) junto al shiny verdadero. Solo se monta al revelar. */
export function ShinyBeforeAfter({ option }: { option: ShinyOption }) {
  const figures = [
    { label: SHINY_BEFORE_AFTER.normal, src: apiAsset(pokemonSpritePath(option.pokemonId)), testId: 'shiny-before' },
    { label: SHINY_BEFORE_AFTER.shiny, src: imageSource(option.sprite), testId: 'shiny-after' },
  ];
  return <section className="panel motion-enter-up mt-3 px-3 py-3 sm:px-4" aria-label={`${SHINY_BEFORE_AFTER.title}: ${option.pokemonName}`} data-testid="shiny-before-after">
    <h3 className="text-center font-display text-base font-bold text-ink/80">{SHINY_BEFORE_AFTER.title} · <span className="text-ink">{option.pokemonName}</span></h3>
    <div className="mt-2 grid grid-cols-2 gap-3">{figures.map((figure) => <figure key={figure.label} className="flex min-w-0 flex-col items-center gap-1">
      <span className="shiny-before-after-stage grid w-full place-items-center rounded-xl">
        <img className="shiny-sprite h-24 w-24 object-contain sm:h-28 sm:w-28" src={figure.src} alt={`${option.pokemonName} ${figure.label.toLowerCase()}`} data-testid={figure.testId} />
      </span>
      <figcaption className={`text-sm font-extrabold ${figure.label === SHINY_BEFORE_AFTER.shiny ? 'text-leaf' : 'text-ink/65'}`}>{figure.label}</figcaption>
    </figure>)}</div>
  </section>;
}
