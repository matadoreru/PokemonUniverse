import type { PokeTabooConfig } from '@pokemon-universe/shared';
import { Clock3, Repeat2, Sparkles } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';

const roundTimes = [30, 45, 60, 90, 120];
const lapOptions = [1, 2, 3, 4, 5];

export function PokeTabooConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokeTabooConfig;
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector
      selected={value.generations}
      label="Generaciones"
      description="El Pokémon secreto y todas las respuestas pertenecerán a este pool."
      onChange={(generations) => void onChange({ ...value, generations })}
    />
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="taboo-time-label">
        <div className="mb-2 flex items-center gap-2"><Clock3 className="text-aqua" size={19} /><span id="taboo-time-label" className="font-extrabold">Tiempo por turno</span></div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{roundTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.roundSeconds === seconds} onClick={() => void onChange({ ...value, roundSeconds: seconds })} className={`min-h-11 rounded-xl border font-extrabold transition-colors ${value.roundSeconds === seconds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{seconds}s</button>)}</div>
      </section>
      <section aria-labelledby="taboo-laps-label">
        <div className="mb-2 flex items-center gap-2"><Repeat2 className="text-aqua" size={19} /><span id="taboo-laps-label" className="font-extrabold">Vueltas</span></div>
        <div className="grid grid-cols-5 gap-2">{lapOptions.map((laps) => <button type="button" key={laps} aria-pressed={value.laps === laps} onClick={() => void onChange({ ...value, laps })} className={`min-h-11 rounded-xl border font-extrabold transition-colors ${value.laps === laps ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{laps}</button>)}</div>
        <p className="mt-2 text-sm font-bold text-ink/60">Cada jugador describe una vez por vuelta.</p>
      </section>
    </div>
    <button type="button" aria-pressed={value.includeRegionalForms} onClick={() => void onChange({ ...value, includeRegionalForms: !value.includeRegionalForms })} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${value.includeRegionalForms ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised text-ink/70'}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${value.includeRegionalForms ? 'bg-aqua text-night' : 'bg-ink/[.07]'}`}><Sparkles size={20} /></span>
      <span className="min-w-0 flex-1"><strong className="block font-display text-lg text-ink">Formas regionales</strong><small className="block font-bold text-ink/65">La forma exacta será obligatoria al responder.</small></span>
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${value.includeRegionalForms ? 'bg-leaf text-night' : 'bg-ink/10'}`}>{value.includeRegionalForms ? '✓' : ''}</span>
    </button>
    <p className="rounded-xl bg-ink/[.04] p-3 text-sm font-bold text-ink/65">El catálogo actual admite de forma fiable las formas regionales. Mega, Gigamax y otras variantes no se incluyen hasta que el repositorio las normalice.</p>
  </fieldset>;
}
