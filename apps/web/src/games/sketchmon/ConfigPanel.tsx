import type { SketchmonConfig } from '@pokemon-universe/shared';
import { Clock3, Lightbulb, Repeat2, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { GenerationSelector } from '../../components/GenerationSelector';

const roundTimes = [60, 90, 120] as const;
const lapOptions = [1, 2, 3] as const;

function ToggleCard({ active, icon, title, description, onClick }: { active: boolean; icon: ReactNode; title: string; description: string; onClick(): void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${active ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised text-ink/70 hover:border-aqua/45'}`}>
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-aqua text-night' : 'bg-ink/[.07]'}`}>{icon}</span>
    <span className="min-w-0 flex-1"><strong className="block font-display text-lg text-ink">{title}</strong><small className="block font-bold text-ink/65">{description}</small></span>
    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${active ? 'bg-leaf text-night' : 'bg-ink/10'}`}>{active ? '✓' : ''}</span>
  </button>;
}

export function SketchmonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as SketchmonConfig;
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector
      selected={value.generations}
      label="Generaciones"
      description="El Pokémon secreto y todas las respuestas pertenecerán a estas generaciones."
      onChange={(generations) => void onChange({ ...value, generations })}
    />
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="sketchmon-time-label">
        <div className="mb-2 flex items-center gap-2"><Clock3 className="text-aqua" size={19} /><span id="sketchmon-time-label" className="font-extrabold">Tiempo por dibujo</span></div>
        <div className="grid grid-cols-3 gap-2">{roundTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.roundSeconds === seconds} onClick={() => void onChange({ ...value, roundSeconds: seconds })} className={`min-h-11 rounded-xl border font-extrabold transition-colors ${value.roundSeconds === seconds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{seconds}s</button>)}</div>
      </section>
      <section aria-labelledby="sketchmon-laps-label">
        <div className="mb-2 flex items-center gap-2"><Repeat2 className="text-aqua" size={19} /><span id="sketchmon-laps-label" className="font-extrabold">Vueltas</span></div>
        <div className="grid grid-cols-3 gap-2">{lapOptions.map((laps) => <button type="button" key={laps} aria-pressed={value.laps === laps} onClick={() => void onChange({ ...value, laps })} className={`min-h-11 rounded-xl border font-extrabold transition-colors ${value.laps === laps ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{laps}</button>)}</div>
        <p className="mt-2 text-sm font-bold text-ink/60">Cada jugador dibuja una vez por vuelta, en un orden nuevo.</p>
      </section>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <ToggleCard active={value.hintsEnabled} icon={<Lightbulb size={20} />} title="Pistas automáticas" description="Revela generación, tipos y evolución durante la ronda. Desactivadas por defecto." onClick={() => void onChange({ ...value, hintsEnabled: !value.hintsEnabled })} />
      <ToggleCard active={value.includeForms} icon={<Sparkles size={20} />} title="Formas compatibles" description="Incluye formas regionales; hay que acertar la forma exacta." onClick={() => void onChange({ ...value, includeForms: !value.includeForms })} />
    </div>
    <p className="rounded-xl bg-ink/[.04] p-3 text-sm font-bold text-ink/65">El Pokémon secreto solo aparece en la pantalla de quien dibuja. Los demás reciben el dibujo y las pistas, nunca su identidad.</p>
  </fieldset>;
}
