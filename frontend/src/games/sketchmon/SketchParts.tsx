import type { PokemonType, RoomMemberView, SketchmonDrawerPokemon, SketchmonGalleryEntry, SketchmonHint, SketchmonStroke } from '@pokemon-universe/shared/public';
import { Check, Eraser, EyeOff, LockKeyhole, PaintBucket, Pencil, Redo2, Sparkles, Trash2, TriangleAlert, Undo2, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';
import { useRemainingMs } from '../../hooks/useServerTime';
import { GuessHints, guessSprite } from '../../room/guess-kit';
import { SketchmonCanvasSurface, type SketchPad } from '../../room/SketchmonCanvas';
import { Badge, Card, Chip, cx, Icon, Panel, Pill, Segmented, TypeBadge } from '../../ui';
import { nextPaletteIndex, SKETCH_COLORS, SKETCH_TOOLS, SKETCH_WIDTHS, sketchColorName, sketchHintText } from './presentation';
import s from './Sketchmon.module.css';

const TOOL_ICON = { PENCIL: Pencil, ERASER: Eraser, FILL: PaintBucket } as const;
const typeLabel = (type: string) => pokemonTypeLabels[type as PokemonType] ?? type;

/**
 * El Pokémon secreto de quien dibuja (solo se monta con su estado propio: nunca llega al DOM de los demás): la carta
 * con su sprite (con el modo memoria, 3 s con su cuenta atrás y después «Referencia oculta»), sus tipos, la regla y los
 * atajos del lienzo. Al título va el foco al empezar el dibujo.
 */
export function SketchSecretPanel({ pokemon, serverOffset, titleRef, className }: { pokemon: SketchmonDrawerPokemon; serverOffset: number; titleRef: Ref<HTMLHeadingElement>; className?: string | undefined }) {
  const previewMs = useRemainingMs(pokemon.previewEndsAt, serverOffset);
  const memory = pokemon.previewEndsAt !== null;
  const spriteVisible = Boolean(pokemon.sprite) && (!memory || previewMs > 0);
  return <Panel variant="cream" title="Tu Pokémon secreto" titleRef={titleRef}
    scroll scrollLabel="Tu Pokémon secreto" className={cx(s.secret, className)} bodyClassName={cx(s.secretBody)}>
    <div className={s.secretGrid} data-testid="sketch-secret">
      <span className={s.secretOnly}><Chip tone="warn" icon={<Icon icon={LockKeyhole} size={18} />}>Solo lo ves tú</Chip></span>
      <div className={s.secretCard}>
        <Card name={pokemon.name} {...(spriteVisible ? { sprite: guessSprite(pokemon.sprite!) } : { art: <Icon icon={EyeOff} size={32} /> })} size="sm" eager
          types={pokemon.types.map((type) => ({ type, label: typeLabel(type) }))} attrs={{ 'data-testid': 'sketch-secret-card' }} />
        {memory && spriteVisible && <span className={s.preview}><Badge>{`${Math.max(1, Math.ceil(previewMs / 1_000))} s`}</Badge></span>}
      </div>
      <div className={s.secretInfo}>
        {memory && <p className={s.memory}>{spriteVisible ? 'Memoriza su aspecto antes de que desaparezca.' : <><strong>Referencia oculta.</strong> Ahora dibuja de memoria: solo conservas el nombre.</>}</p>}
        <p className={s.rule}>No escribas letras, números, nombres ni símbolos que revelen directamente el Pokémon.</p>
        <p className={s.shortcuts}>Ctrl+Z deshace; Ctrl+Mayús+Z rehace.</p>
      </div>
    </div>
  </Panel>;
}

/**
 * El lienzo en su `Panel`: escala con el hueco (4:3, más grande a 1920) y, vacío, dice qué hacer. Quien dibuja lo
 * maneja con el puntero (ratón, lápiz o dedo); los demás lo ven en directo.
 */
export function SketchCanvasPanel({ strokes, label, title, right, pad, emptyText, className, testId }: {
  strokes: readonly SketchmonStroke[];
  label: string;
  title?: string;
  right?: ReactNode;
  /** Solo quien dibuja. */
  pad?: SketchPad | undefined;
  emptyText: string;
  className?: string | undefined;
  testId: string;
}) {
  const empty = strokes.length === 0 && !pad?.optimisticStroke;
  return <Panel variant="cream" as="section" {...(title ? { title } : { 'aria-label': label })} {...(right ? { right } : {})} className={cx(s.canvasPanel, className)} bodyClassName={cx(s.canvasBody)}>
    <div className={s.canvasFrame}>
      <SketchmonCanvasSurface strokes={strokes} label={label} optimisticStroke={pad?.optimisticStroke ?? null} handlers={pad?.handlers} testId={testId} />
      {empty && <span className={s.canvasEmpty} aria-hidden="true">{emptyText}</span>}
    </div>
  </Panel>;
}

/** Paleta de colores: un grupo de radio con foco itinerante (flechas, Inicio y Fin); cada muestra con su nombre. */
function SketchPalette({ value, onChange }: { value: (typeof SKETCH_COLORS)[number]; onChange(color: (typeof SKETCH_COLORS)[number]): void }) {
  const index = SKETCH_COLORS.indexOf(value);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextPaletteIndex(index, event.key, SKETCH_COLORS.length);
    if (next === null) return;
    event.preventDefault();
    onChange(SKETCH_COLORS[next]!);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return <div className={s.palette} role="radiogroup" aria-label="Color" onKeyDown={onKeyDown} data-testid="sketch-palette">
    {SKETCH_COLORS.map((color) => {
      const on = color === value;
      return <button key={color} type="button" role="radio" aria-checked={on} aria-label={sketchColorName(color)} title={sketchColorName(color)} tabIndex={on ? 0 : -1}
        className={cx(s.swatch, on && s.swatchOn)} onClick={() => onChange(color)}>
        <span className={s.swatchColor} style={{ backgroundColor: color }} aria-hidden="true">{on && <Icon icon={Check} size={18} className={s.swatchCheck} />}</span>
      </button>;
    })}
  </div>;
}

/**
 * Herramientas de quien dibuja (la placa de abajo): herramienta (lápiz, goma, relleno) y grosor como `Segmented` con
 * nombre, la paleta con el nombre del color elegido y deshacer, rehacer y limpiar (`Pill` redondas con nombre; limpiar
 * se puede deshacer, como hoy, así que no pide confirmación). Si un trazo no llega al servidor, lo dice aquí (el aviso
 * global no: los trazos van con `report: false`).
 */
export function SketchToolbar({ pad, disabled }: { pad: SketchPad; disabled: boolean }) {
  return <Panel variant="cream" as="section" aria-label="Herramientas de dibujo" className={cx(s.tools)} bodyClassName={cx(s.toolsBody)}>
    <div className={s.toolGroup}>
      <Segmented label="Herramienta" value={pad.tool} className={cx(s.toolSeg)} onChange={pad.setTool}
        options={SKETCH_TOOLS.map(({ value, name }) => ({ value, disabled, label: <span className={s.optLabel}><Icon icon={TOOL_ICON[value]} size={22} /><span className={s.optText}>{name}</span></span> }))} />
    </div>
    <div className={s.widthGroup}>
      <Segmented label="Grosor" value={pad.width} className={cx(s.widthSeg)} onChange={pad.setWidth}
        options={SKETCH_WIDTHS.map(({ value, name }) => ({ value, disabled, label: <span className={s.optLabel}><span className={s.dot} style={{ width: Math.max(6, value), height: Math.max(6, value) }} aria-hidden="true" /><span className="sr-only">{name}</span></span> }))} />
    </div>
    <div className={s.actions}>
      <Pill size="round" variant="cream" icon={Undo2} aria-label="Deshacer último trazo" title="Deshacer (Ctrl+Z)" aria-keyshortcuts="Control+Z" disabled={disabled} onClick={pad.undo} data-testid="sketch-undo" />
      <Pill size="round" variant="cream" icon={Redo2} aria-label="Rehacer último trazo" title="Rehacer (Ctrl+Mayús+Z)" aria-keyshortcuts="Control+Shift+Z" disabled={disabled} onClick={pad.redo} data-testid="sketch-redo" />
      <Pill size="round" variant="danger" icon={Trash2} aria-label="Limpiar lienzo" title="Limpiar lienzo (se puede deshacer)" disabled={disabled} onClick={pad.clear} data-testid="sketch-clear" />
    </div>
    <div className={s.colorGroup}>
      <SketchPalette value={pad.color} onChange={pad.setColor} />
    </div>
    <p className={s.colorName} data-testid="sketch-color-name">Color: <strong>{sketchColorName(pad.color)}</strong></p>
    {pad.syncError && <p className={s.syncError} data-testid="sketch-sync-error"><Icon icon={TriangleAlert} size={18} />{pad.syncError}</p>}
  </Panel>;
}

/** Pistas automáticas (si están activadas): generación, tipos (con su nombre) y evolución, en la franja del kit. */
export function SketchHints({ hints, className }: { hints: readonly SketchmonHint[]; className?: string | undefined }) {
  return <GuessHints title="Pistas automáticas" className={className} hints={hints.map((hint) => ({
    key: hint.kind,
    label: hint.kind === 'TYPES'
      ? <span className={s.hintTypes}><span className="sr-only">{sketchHintText(hint, typeLabel)}</span><span aria-hidden="true" className={s.hintTypes}>Tipo{hint.types.map((type) => <TypeBadge key={type} type={type} label={typeLabel(type)} size="sm" />)}</span></span>
      : sketchHintText(hint, typeLabel),
    ...(hint.kind === 'TYPES' ? { icon: <Icon icon={Sparkles} size={18} /> } : {}),
  }))} />;
}

/** La galería de los dibujos de la partida (resultados): cada dibujo con su Pokémon, quién lo hizo, la vuelta y si se adivinó. */
export function SketchGallery({ entries, members }: { entries: readonly SketchmonGalleryEntry[]; members: ReadonlyMap<string, RoomMemberView> }) {
  return <Panel variant="dark" title="Los dibujos de la partida" right={<Badge tone="cream">{String(entries.length)}</Badge>} className={cx(s.gallery)} bodyClassName={cx(s.galleryBody)}
    status={entries.length === 0 ? { kind: 'empty', title: 'Sin dibujos', text: 'No se pudo completar ningún dibujo en esta partida.', live: false } : null}>
    <ul className={s.galleryList} aria-label="Dibujos de la partida" data-testid="sketch-gallery">{entries.map((entry) => {
      const drawer = members.get(entry.drawerId)?.displayName ?? 'Entrenador';
      return <li key={entry.roundNumber} className={s.galleryItem} data-testid="sketch-gallery-item">
        <div className={s.galleryCanvas}><SketchmonCanvasSurface strokes={entry.drawing} label={`Dibujo de ${entry.pokemon.name} por ${drawer}`} /></div>
        <div className={s.galleryMeta}>
          <img src={guessSprite(entry.pokemon.sprite)} alt="" className={s.gallerySprite} loading="lazy" />
          <span className={s.galleryText}>
            <strong title={entry.pokemon.name}>{entry.pokemon.name}</strong>
            <span>de {drawer} · Vuelta {entry.lapNumber}</span>
          </span>
          {entry.winnerId
            ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Adivinado</Chip>
            : <Chip tone="bad" icon={<Icon icon={X} size={18} />}>Sin acierto</Chip>}
        </div>
      </li>;
    })}</ul>
  </Panel>;
}
