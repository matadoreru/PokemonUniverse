import type { WhosThatPokemonConfig } from '@pokemon-universe/shared';
import { Eye, Lightbulb, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { GenerationSelector } from '../../components/GenerationSelector';

const roundTimes = [10, 15, 20, 30, 45, 60];
const roundCounts = [5, 10, 15, 20];

function ToggleCard({ active, title, description, icon, onClick }: { active: boolean; title: string; description: string; icon: ReactNode; onClick(): void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised text-ink/70'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-aqua text-night' : 'bg-ink/[0.07]'}`}>{icon}</span><span className="min-w-0 flex-1"><strong className="block font-display text-lg text-ink">{title}</strong><small className="block font-bold text-ink/65">{description}</small></span><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${active ? 'bg-leaf text-night' : 'bg-ink/10'}`}>{active ? '✓' : ''}</span></button>;
}

export function WhosThatPokemonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as WhosThatPokemonConfig;
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones del pool" description="La generación normalizada del catálogo compartido también se aplica a las formas regionales." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-5 lg:grid-cols-2">
      <section><span className="label">Tiempo por ronda</span><div className="grid grid-cols-3 gap-2">{roundTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.roundSeconds === seconds} onClick={() => void onChange({ ...value, roundSeconds: seconds })} className={`min-h-11 rounded-xl border font-extrabold ${value.roundSeconds === seconds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{seconds}s</button>)}</div></section>
      <section><span className="label">Número de rondas</span><div className="grid grid-cols-4 gap-2">{roundCounts.map((rounds) => <button type="button" key={rounds} aria-pressed={value.rounds === rounds} onClick={() => void onChange({ ...value, rounds })} className={`min-h-11 rounded-xl border font-extrabold ${value.rounds === rounds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{rounds}</button>)}</div></section>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <ToggleCard active={value.hintsEnabled} title="Pistas adicionales" description={value.hintsEnabled ? 'Generación, tipo y evolución aparecerán progresivamente.' : 'Solo se mostrará la silueta.'} icon={value.hintsEnabled ? <Lightbulb /> : <Eye />} onClick={() => void onChange({ ...value, hintsEnabled: !value.hintsEnabled })} />
      <ToggleCard active={value.includeRegionalForms} title="Formas regionales" description="Incluye las formas diferenciadas y con sprite propio disponibles en el catálogo." icon={<Sparkles />} onClick={() => void onChange({ ...value, includeRegionalForms: !value.includeRegionalForms })} />
    </div>
    <p className="rounded-xl bg-ink/[0.04] p-3 text-sm font-bold text-ink/65">Las formas Gigamax y otras variantes no se activan: el dataset actual solo normaliza de forma fiable las formas regionales.</p>
  </fieldset>;
}
