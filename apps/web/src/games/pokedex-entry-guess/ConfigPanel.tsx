import type { PokedexEntryGuessConfig } from '@pokemon-universe/shared';
import { BookOpenText, Lightbulb } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';

const roundTimes = [15, 20, 25, 30, 45, 60];
const roundCounts = [5, 10, 15, 20];
const hintOptions: Array<{ key: keyof PokedexEntryGuessConfig['hints']; label: string }> = [
  { key: 'generation', label: 'Generación' }, { key: 'type', label: 'Tipo' }, { key: 'evolution', label: 'Etapa evolutiva' },
  { key: 'typeCount', label: 'Nº de tipos' }, { key: 'category', label: 'Legendario / Mítico' },
];

export function PokedexEntryGuessConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokedexEntryGuessConfig;
  function toggleHint(key: keyof PokedexEntryGuessConfig['hints']) {
    const hints = { ...value.hints, [key]: !value.hints[key] };
    if (Object.values(hints).some(Boolean)) void onChange({ ...value, hints });
  }
  const reference = Math.max(...value.generations);
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones del objetivo" onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="flex items-start gap-3 rounded-2xl border border-aqua/25 bg-aqua/[0.08] p-4"><BookOpenText className="shrink-0 text-aqua" /><div><span className="label !mb-0">Generación de referencia</span><strong className="block font-display text-xl">Generación {reference}</strong><p className="text-sm font-bold text-ink/65">Se elige una entrada de esta generación o la más reciente anterior. Nunca una futura.</p></div></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section><span className="label">Tiempo por ronda</span><div className="grid grid-cols-3 gap-2">{roundTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.roundSeconds === seconds} onClick={() => void onChange({ ...value, roundSeconds: seconds })} className={`min-h-11 rounded-xl border font-extrabold ${value.roundSeconds === seconds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{seconds}s</button>)}</div></section>
      <section><span className="label">Número de rondas</span><div className="grid grid-cols-4 gap-2">{roundCounts.map((rounds) => <button type="button" key={rounds} aria-pressed={value.rounds === rounds} onClick={() => void onChange({ ...value, rounds })} className={`min-h-11 rounded-xl border font-extrabold ${value.rounds === rounds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{rounds}</button>)}</div></section>
    </div>
    <section><button type="button" aria-pressed={value.hintsEnabled} onClick={() => void onChange({ ...value, hintsEnabled: !value.hintsEnabled })} className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border p-3 text-left ${value.hintsEnabled ? 'border-electric bg-electric/10' : 'border-ink/10 bg-surface-raised'}`}><span className={`grid h-11 w-11 place-items-center rounded-xl ${value.hintsEnabled ? 'bg-electric text-night' : 'bg-ink/[0.07] text-ink/60'}`}><Lightbulb /></span><span className="flex-1"><strong className="block font-display text-xl">Pistas adicionales</strong><small className="font-bold text-ink/65">{value.hintsEnabled ? 'Visibles desde el inicio de cada ronda.' : 'Solo se mostrará la entrada Pokédex.'}</small></span><span className={`grid h-6 w-6 place-items-center rounded-full font-black ${value.hintsEnabled ? 'bg-leaf text-night' : 'bg-ink/10'}`}>{value.hintsEnabled ? '✓' : ''}</span></button>
      {value.hintsEnabled && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{hintOptions.map((option) => <button type="button" key={option.key} aria-pressed={value.hints[option.key]} onClick={() => toggleHint(option.key)} className={`min-h-11 rounded-xl border px-3 text-left font-extrabold ${value.hints[option.key] ? 'border-leaf/40 bg-leaf/10 text-leaf' : 'border-ink/10 bg-surface-raised text-ink/60'}`}>{value.hints[option.key] ? '✓ ' : ''}{option.label}</button>)}</div>}
    </section>
    <p className="rounded-xl bg-ink/[0.04] p-3 text-sm font-bold text-ink/65">Solo se usan formas base: el dataset actual no ofrece entradas españolas propias y distinguibles para regionales o Gigamax.</p>
  </fieldset>;
}
