import { pokemonSpritePath, type RoomMemberView, type ShinyOption } from '@pokemon-universe/shared/public';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { apiAsset } from '../../lib/api';
import { Badge, Card, Chip, cx, Icon, Panel, ScorePop, type CardAttrs, type CardState } from '../../ui';
import { SHINY_BEFORE_AFTER } from './reveal';
import s from './ShinyVote.module.css';

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const imageSource = (source: string) => source.startsWith('/api/') ? `${API_ORIGIN}${source}` : source;

const ignoreSettled = () => undefined;

/**
 * Sprites ya cargados (los fallidos no: al volver a montarse se reintentan, con su esqueleto). Al votar o al revelar la
 * carta pasa de botón a caja y su contenido se vuelve a montar: con esto el sprite vuelve visible desde el primer
 * pintado, sin esqueleto ni fundido encima del giro. Se vacía al salir de la partida (`clearShinySprites`).
 */
const settledSprites = new Set<string>();

/** Olvida los sprites cargados (la pantalla del juego lo llama al desmontarse). */
export function clearShinySprites(): void {
  settledSprites.clear();
}

/**
 * Sprite de la carta (en el hueco de arte de `Card`): la imagen se monta siempre (para que cargue) y el esqueleto la cubre
 * hasta que la ronda está lista. `dimmed`: carta incorrecta al revelar; solo el sprite se apaga, el nombre conserva el
 * contraste.
 */
function PokemonSprite({ option, loading, dimmed = false, onSettled }: { option: ShinyOption; loading: boolean; dimmed?: boolean; onSettled(optionId: ShinyOption['id']): void }) {
  const [loaded, setLoaded] = useState(() => settledSprites.has(option.sprite));
  const image = useRef<HTMLImageElement>(null);
  // Cargada o fallida, la carta deja de esperar (el esqueleto no bloquea la ronda); solo la cargada se recuerda.
  const markSettled = (ok: boolean) => {
    if (ok) settledSprites.add(option.sprite);
    setLoaded(true);
    onSettled(option.id);
  };
  // Una imagen ya en caché (o rota) puede terminar antes de que React enganche onLoad/onError.
  useEffect(() => {
    const img = image.current;
    if (settledSprites.has(option.sprite)) markSettled(true);
    else if (img?.complete) markSettled(img.naturalWidth > 0);
    // `markSettled` solo usa estas mismas dependencias.
  }, [onSettled, option.id, option.sprite]);
  const visible = loaded && !loading;
  return <span className={cx(s.stage, dimmed && s.dimmed)} data-dimmed={dimmed ? 'true' : undefined}>
    {!visible && <span className={s.skeleton} data-testid="shiny-card-skeleton" />}
    <img ref={image} className={cx(s.sprite, visible && s.spriteOn)} src={imageSource(option.sprite)} alt="" onLoad={() => markSettled(true)} onError={() => markSettled(false)} />
  </span>;
}

/** Quién votó la opción: hasta tres avatares, «+N» y la insignia con el recuento. */
function VoterSummary({ optionId, voters }: { optionId: ShinyOption['id']; voters: RoomMemberView[] }) {
  const visible = voters.slice(0, 3);
  const hidden = voters.length - visible.length;
  return <span className={s.voters} data-testid={`shiny-voters-${optionId}`}>
    <span className={s.avatars} aria-hidden="true">{visible.map((member) => <Avatar key={member.id} name={member.displayName} avatar={member.avatar} size="sm" />)}</span>
    {hidden > 0 && <span className={s.more} aria-hidden="true">+{hidden}</span>}
    <Badge tone="navy">{voters.length} {voters.length === 1 ? 'voto' : 'votos'}</Badge>
  </span>;
}

/** Estado de la carta del catálogo y su chip, según la fase y el voto propio. */
export function shinyCardState({ reveal, selected, correct }: { reveal: boolean; selected: boolean; correct: boolean }): CardState {
  if (reveal) return correct ? 'correct' : selected ? 'wrong' : 'idle';
  return selected ? 'selected' : 'idle';
}

export function ShinyOptionCard({ option, voters, selected, confirmed, interactive, loading = false, reveal, correct, showVoters, feedback = null, onSelect, onSettled }: {
  option: ShinyOption;
  voters: RoomMemberView[];
  selected: boolean;
  confirmed: boolean;
  /** Se puede votar (o se podrá en cuanto carguen las cartas): botón. Si no, una carta fija, sin apagarse. */
  interactive: boolean;
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
  const own = selected && (reveal || confirmed);
  const state = shinyCardState({ reveal, selected, correct });
  const flip = reveal && correct;
  const chip = reveal
    ? own ? <Chip tone={correct ? 'ok' : 'bad'} icon={<Icon icon={correct ? Check : X} size={18} />}>Tu voto</Chip> : null
    : selected ? <Chip tone={confirmed ? 'ok' : 'info'} icon={<Icon icon={Check} size={18} />}>{confirmed ? 'Tu voto' : 'Seleccionado'}</Chip> : null;
  const ariaState = reveal
    ? correct ? own ? ', shiny verdadero, tu voto acertado' : ', shiny verdadero' : own ? ', tu voto, incorrecta' : ', opción incorrecta'
    : selected ? confirmed ? ', voto confirmado' : ', seleccionada' : '';
  const ariaPoints = reveal && own && feedback ? `, ${feedback.label} puntos` : '';
  const label = `Opción ${option.id}: ${option.pokemonName}${ariaState}${ariaPoints}`;
  const attrs: CardAttrs = {
    'data-shiny-option': option.id,
    'data-correct': reveal && correct ? 'true' : undefined,
    ...(interactive ? { 'aria-label': label, 'aria-keyshortcuts': `${option.id} ${option.id.charCodeAt(0) - 64}` } : {}),
  };
  return <Card
    size="fill"
    name={option.pokemonName}
    state={state}
    flip={flip}
    attrs={attrs}
    art={<PokemonSprite key={option.sprite} option={option} loading={loading} dimmed={reveal && !correct && !own} onSettled={onSettled ?? ignoreSettled} />}
    {...(interactive ? { onSelect, disabled: loading } : {})}
  >
    <span className={cx(s.letter, (selected || flip) && s.letterOn)} aria-hidden="true">{option.id}</span>
    {/* El «+N» solo suena (y sale) con puntos: un fallo ya tiene su sonido y su «+0» en la pantalla inferior. */}
    {reveal && own && feedback && feedback.points > 0 && <ScorePop key={`${option.id}|${feedback.label}`} points={feedback.points} color="var(--ok)" className={s.pop} self />}
    {!interactive && <span className="sr-only">{label}</span>}
    {(chip || (showVoters && voters.length > 0)) && <span className={s.foot}>
      {chip}
      {showVoters && voters.length > 0 && <VoterSummary optionId={option.id} voters={voters} />}
    </span>}
  </Card>;
}

/** Una figura del antes y el después: si la imagen falla, deja el hueco con «Sin sprite» en lugar de una imagen rota. */
function BeforeAfterFigure({ label, src, alt, testId, shiny }: { label: string; src: string; alt: string; testId: string; shiny: boolean }) {
  const [failed, setFailed] = useState(false);
  return <figure className={s.figure}>
    <span className={cx(s.figureStage, shiny && s.figureShiny)}>
      {failed
        ? <span className={s.missing} data-testid={`${testId}-missing`}>{SHINY_BEFORE_AFTER.missing}</span>
        : <img className={s.figureSprite} src={src} alt={alt} data-testid={testId} onError={() => setFailed(true)} />}
    </span>
    <figcaption className={s.caption}>{label}</figcaption>
  </figure>;
}

/**
 * Antes y después de la revelación: el sprite normal (proxy de la Pokédex) junto al shiny verdadero. Solo se monta al
 * revelar (el sprite normal daría la respuesta): en la columna lateral en escritorio y bajo las cartas en el móvil.
 */
export function ShinyBeforeAfter({ option }: { option: ShinyOption }) {
  return <Panel variant="cream" title={SHINY_BEFORE_AFTER.title} aria-label={`${SHINY_BEFORE_AFTER.title}: ${option.pokemonName}`} className={cx(s.beforeAfter)}>
    <div data-testid="shiny-before-after">
      <p className={s.beforeName} title={option.pokemonName}>{option.pokemonName}</p>
      <div className={s.figures}>
        <BeforeAfterFigure label={SHINY_BEFORE_AFTER.normal} src={apiAsset(pokemonSpritePath(option.pokemonId))} alt={`${option.pokemonName} normal`} testId="shiny-before" shiny={false} />
        <BeforeAfterFigure label={SHINY_BEFORE_AFTER.shiny} src={imageSource(option.sprite)} alt={`${option.pokemonName} shiny`} testId="shiny-after" shiny />
      </div>
    </div>
  </Panel>;
}
