import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Badge, Card, Field, Panel, StateBox } from '../ui';
import { searchPokemonOptions, type PokemonSearchOption } from './pokemon-search';
import { resultFocusTarget, selectorView } from './pokemon-selector-state';
import s from './PokemonSelector.module.css';

const SKELETON_CARDS = 6;

/** Columnas que pinta la rejilla ahora: las cartas que comparten la fila de la primera. */
function gridColumns(buttons: readonly HTMLElement[]): number {
  const top = buttons[0]?.offsetTop;
  if (top === undefined) return 1;
  let columns = 0;
  while (columns < buttons.length && buttons[columns]!.offsetTop === top) columns++;
  return Math.max(1, columns);
}

export function PokemonSelector({ pokemon, locked, disabled, confirmationDisabled = false, variant = 'card', autoFocus = true, inputLabel = 'Buscar Pokémon', maxResults = 40, loading = false, loadError = '', onRetry, initialQuery = '', onSelect }: { pokemon: readonly PokemonSearchOption[]; locked: Set<string>; disabled: boolean; confirmationDisabled?: boolean; variant?: 'card' | 'embedded'; autoFocus?: boolean; inputLabel?: string; maxResults?: number; loading?: boolean; loadError?: string; onRetry?(): void; /** Búsqueda inicial (galería y pruebas). */ initialQuery?: string; onSelect(id: string): Promise<void> }) {
  const [query, setQuery] = useState(initialQuery);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchPokemonOptions(pokemon, query, maxResults), [maxResults, pokemon, query]);
  const view = selectorView({ loading, loadError, query, resultCount: results.length });
  const blocked = disabled || confirmationDisabled || Boolean(pending);
  // Foco sin desplazar la página: con `autoFocus` el navegador la desplaza y la cabecera fija tapa el contenido.
  useEffect(() => { if (autoFocus) inputRef.current?.focus({ preventScroll: true }); }, [autoFocus]);
  // Sin catálogo el campo no sirve: el foco pasa a «Reintentar» si estaba en el buscador (o nadie lo tenía).
  useEffect(() => {
    if (view !== 'error') return;
    const active = document.activeElement;
    const idle = active === null || active === document.body;
    if (active !== inputRef.current && !(autoFocus && idle)) return;
    errorRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [autoFocus, view]);
  // Tras «Reintentar» el botón desaparece: el foco vuelve al campo en vez de caer en <body>.
  function retry() { onRetry?.(); inputRef.current?.focus({ preventScroll: true }); }
  function clearQuery() { setQuery(''); inputRef.current?.focus({ preventScroll: true }); }
  const firstSelectableId = results.find((entry) => !locked.has(entry.id))?.id;
  async function select(id: string) {
    if (submitting.current || disabled || confirmationDisabled || locked.has(id)) return;
    submitting.current = true; setPending(id); setError('');
    try { await onSelect(id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Selección rechazada'); }
    finally { submitting.current = false; setPending(''); }
  }
  /** Flechas, Inicio, Fin y Escape entre el campo y la rejilla; Enter en una carta la elige (es un botón). */
  function moveFocus(event: KeyboardEvent, index: number) {
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const target = resultFocusTarget({ index, key: event.key, columns: gridColumns(buttons), enabled: buttons.map((button) => !button.disabled) });
    if (target === null) return;
    event.preventDefault();
    if (target === 'input') inputRef.current?.focus();
    else buttons[target]?.focus();
  }
  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') { moveFocus(event, -1); return; }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (firstSelectableId) void select(firstSelectableId);
  }
  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(gridRef.current?.querySelectorAll('button') ?? []);
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index >= 0) moveFocus(event, index);
  }

  const body = <div className={s.selector}>
    <Field ref={inputRef} label={inputLabel} aria-label={inputLabel} hideLabel icon={Search} large placeholder="Buscar Pokémon…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKey} disabled={disabled} autoComplete="off" error={error || null} hint="Enter elige la primera · ↓ recorre la lista" />
    {view === 'loading' && <div aria-busy="true" role="status" className={s.tray}><span className="sr-only">Cargando Pokémon…</span><div className={s.grid} aria-hidden="true">{Array.from({ length: SKELETON_CARDS }, (_, index) => <span key={index} data-skeleton className={s.skeleton}><i className={s.skeletonArt} /><i className={s.skeletonName} /></span>)}</div></div>}
    {view === 'error' && <div ref={errorRef} className={s.tray}><StateBox kind="error" onCream title={loadError} {...(onRetry ? { action: { label: 'Reintentar', onClick: retry } } : {})} /></div>}
    {view === 'no-matches' && <div className={s.tray}><StateBox kind="empty" onCream title={`Ningún Pokémon coincide con “${query.trim()}”.`} text="Prueba con otra parte del nombre: no hace falta escribir tildes." action={{ label: 'Borrar búsqueda', onClick: clearQuery }} /></div>}
    {view === 'results' && <div className={s.tray}><div ref={gridRef} aria-busy={Boolean(pending)} className={`pokemon-selector-results ${s.grid} ${s.scroll}`} onKeyDown={onGridKey}>{results.map((entry) => {
      const unavailable = locked.has(entry.id);
      const primary = entry.id === firstSelectableId && !blocked;
      return <Card key={entry.id} size="sm" action decorativeSprite name={entry.name} sprite={entry.sprite} state={primary ? 'selected' : 'idle'} disabled={blocked || unavailable} onSelect={() => void select(entry.id)}>
        {primary && <span aria-hidden="true"><Badge tone="navy">Enter ↵</Badge></span>}
        {/* Sin `aria-hidden`: forma parte del nombre de la carta deshabilitada y explica por qué no se puede elegir. */}
        {unavailable && <span className={s.unavailable}>No disponible</span>}
      </Card>;
    })}</div></div>}
  </div>;
  return variant === 'card' ? <Panel variant="cream" as="div">{body}</Panel> : body;
}
