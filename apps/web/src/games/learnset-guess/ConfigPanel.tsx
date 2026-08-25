import { GENERATION_LEARNSET_SOURCES, type LearnsetGuessConfig } from '@pokemon-universe/shared';
import { BookOpenCheck, Eye, EyeOff } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

export function LearnsetGuessConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as LearnsetGuessConfig; const reference = Math.max(...value.generations) as keyof typeof GENERATION_LEARNSET_SOURCES;
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones de Pokémon" accent="electric" onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="flex items-start gap-3 rounded-2xl border border-aqua/25 bg-aqua/10 p-4"><BookOpenCheck className="shrink-0 text-aqua" /><div><span className="label !mb-0">Generación de learnset automática</span><strong className="block font-display text-lg">Gen {reference} · {GENERATION_LEARNSET_SOURCES[reference].label}</strong><p className="text-sm font-bold text-ink/65">Se utiliza la generación más alta que hayas activado.</p></div></div>
    <div className="grid gap-3 md:grid-cols-2">
      <Toggle icon={value.showLevels ? Eye : EyeOff} label="Mostrar niveles" description="Indica el nivel exacto de cada movimiento." active={value.showLevels} onClick={() => void onChange({ ...value, showLevels: !value.showLevels })} />
      <Toggle icon={value.showEvolution ? Eye : EyeOff} label="Información evolutiva" description="Muestra únicamente la etapa, nunca nombres." active={value.showEvolution} onClick={() => void onChange({ ...value, showEvolution: !value.showEvolution })} />
    </div>
    <div className="grid gap-4 md:grid-cols-2"><ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={15} max={120} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /><ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} /></div>
    <p className="text-sm font-bold text-ink/65">Nuevas pistas cada 7 segundos · cooldown de 1 segundo tras un fallo.</p>
  </fieldset>;
}

function Toggle({ icon: Icon, label, description, active, onClick }: { icon: typeof Eye; label: string; description: string; active: boolean; onClick(): void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left ${active ? 'border-leaf bg-leaf/10' : 'border-ink/10 bg-surface-raised'}`}><Icon className={active ? 'text-leaf' : 'text-ink/55'} /><span><strong className="block font-display text-lg">{label}: {active ? 'Sí' : 'No'}</strong><small className="font-bold text-ink/65">{description}</small></span></button>;
}
