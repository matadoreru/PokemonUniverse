import type { ZoomedPokemonConfig, ZoomedPokemonHintKind, ZoomedPokemonImageMode } from '@pokemon-universe/shared';
import { Image, Images, Lightbulb, Sparkles } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';

const roundTimes = [15, 20, 30, 45, 60];
const roundCounts = [5, 10, 15, 20];
const modes: Array<{ id: ZoomedPokemonImageMode; label: string; description: string }> = [
  { id: 'MIXED', label: 'Mixto', description: 'Alterna artworks y sprites, con fallback seguro.' },
  { id: 'SPRITE', label: 'Sprites', description: 'Usa el sprite del catálogo actual.' },
  { id: 'ARTWORK', label: 'Artworks', description: 'Solo PNG locales válidos.' },
];
const hintOptions: Array<{ id: ZoomedPokemonHintKind; label: string }> = [
  { id: 'GENERATION', label: 'Generación' }, { id: 'TYPE', label: 'Tipo' }, { id: 'TYPE_COUNT', label: 'Nº de tipos' },
  { id: 'EVOLUTION', label: 'Etapa evolutiva' }, { id: 'CATEGORY', label: 'Legendario / Mítico' },
];

export function validateZoomedPokemonConfig(config: unknown): string | null {
  const value = config as Partial<ZoomedPokemonConfig>;
  if (!value.generations?.length) return 'Selecciona al menos una generación.';
  return null;
}

export function ZoomedPokemonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as ZoomedPokemonConfig;
  const update = (next: Partial<ZoomedPokemonConfig>) => void onChange({ ...value, ...next });
  const toggleHint = (hint: ZoomedPokemonHintKind) => update({ hintKinds: value.hintKinds.includes(hint) ? value.hintKinds.filter((item) => item !== hint) : [...value.hintKinds, hint] });
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} onChange={(generations) => update({ generations })} />
    <section><span className="label">Imagen</span><div className="grid gap-2 md:grid-cols-3">{modes.map((mode) => <button type="button" key={mode.id} aria-pressed={value.imageMode === mode.id} onClick={() => update({ imageMode: mode.id })} className={`flex min-h-24 items-center gap-3 rounded-2xl border p-3 text-left ${value.imageMode === mode.id ? 'border-electric bg-electric/10' : 'border-ink/10 bg-surface-raised'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${value.imageMode === mode.id ? 'bg-electric text-night' : 'bg-ink/5 text-ink/65'}`}>{mode.id === 'MIXED' ? <Images /> : mode.id === 'ARTWORK' ? <Sparkles /> : <Image />}</span><span><strong className="block font-display text-lg">{mode.label}</strong><small className="font-bold text-ink/65">{mode.description}</small></span></button>)}</div>{value.imageMode === 'ARTWORK' && <p className="mt-2 text-sm font-bold text-electric">El servidor validará que exista al menos un artwork para estas generaciones al empezar.</p>}</section>
    <div className="grid gap-5 lg:grid-cols-2"><section><span className="label">Tiempo</span><div className="grid grid-cols-5 gap-2">{roundTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.roundSeconds === seconds} onClick={() => update({ roundSeconds: seconds })} className={`min-h-11 rounded-xl border font-extrabold ${value.roundSeconds === seconds ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{seconds}s</button>)}</div></section><section><span className="label">Rondas</span><div className="grid grid-cols-4 gap-2">{roundCounts.map((rounds) => <button type="button" key={rounds} aria-pressed={value.rounds === rounds} onClick={() => update({ rounds })} className={`min-h-11 rounded-xl border font-extrabold ${value.rounds === rounds ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{rounds}</button>)}</div></section></div>
    <section className="rounded-2xl border border-ink/10 bg-ink/[.025] p-4"><button type="button" aria-pressed={value.hintsEnabled} onClick={() => update({ hintsEnabled: !value.hintsEnabled })} className="flex w-full items-center gap-3 text-left"><span className={`grid h-11 w-11 place-items-center rounded-xl ${value.hintsEnabled ? 'bg-electric text-night' : 'bg-ink/10'}`}><Lightbulb /></span><span className="flex-1"><strong className="block font-display text-xl">Pistas adicionales</strong><small className="font-bold text-ink/65">{value.hintsEnabled ? 'Visibles desde el primer segundo.' : 'Desactivadas por defecto.'}</small></span><span className={`rounded-full px-3 py-1 text-xs font-black ${value.hintsEnabled ? 'bg-leaf text-night' : 'bg-ink/10 text-ink/60'}`}>{value.hintsEnabled ? 'ON' : 'OFF'}</span></button>{value.hintsEnabled && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{hintOptions.map((hint) => <label key={hint.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface-raised px-3 font-bold"><input type="checkbox" checked={value.hintKinds.includes(hint.id)} onChange={() => toggleHint(hint.id)} /> {hint.label}</label>)}</div>}</section>
    <p className="text-sm font-bold text-ink/65">Las formas regionales, Mega, Gigamax y demás variantes se incluyen cuando el catálogo contiene una clave e imagen propias. Nunca se usa altura o peso como pista.</p>
  </fieldset>;
}
