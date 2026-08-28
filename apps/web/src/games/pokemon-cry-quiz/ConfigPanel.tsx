import type { PokemonCryQuizConfig } from '@pokemon-universe/shared';
import { AudioLines, History, Shuffle } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

const versions = [
  { value: 'LATEST', label: 'Actual', detail: 'Grito moderno disponible', icon: <AudioLines /> },
  { value: 'LEGACY', label: 'Clásico', detail: 'Versión histórica del grito', icon: <History /> },
  { value: 'RANDOM', label: 'Aleatorio', detail: 'Alterna entre versiones disponibles', icon: <Shuffle /> },
] as const;

export function PokemonCryQuizConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonCryQuizConfig;
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones" description="Solo entrarán Pokémon con un grito persistido en el catálogo local." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-4 md:grid-cols-2"><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /><ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} accent="aqua" formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} /></div>
    <section><span className="label">Versión del grito</span><div className="grid gap-2 sm:grid-cols-3">{versions.map((option) => <button key={option.value} type="button" aria-pressed={value.cryVersion === option.value} onClick={() => void onChange({ ...value, cryVersion: option.value })} className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${value.cryVersion === option.value ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised hover:border-aqua/50'}`}><span className={value.cryVersion === option.value ? 'text-aqua' : 'text-ink/55'}>{option.icon}</span><span><strong className="block">{option.label}</strong><small className="block font-bold text-ink/60">{option.detail}</small></span></button>)}</div></section>
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-ink/10 bg-surface-raised p-3"><span><strong className="block">Formas regionales</strong><small className="font-bold text-ink/60">Incluye únicamente formas con grito propio disponible.</small></span><input type="checkbox" checked={value.includeRegionalForms} onChange={(event) => void onChange({ ...value, includeRegionalForms: event.target.checked })} className="h-5 w-5 accent-aqua" /></label>
  </fieldset>;
}
