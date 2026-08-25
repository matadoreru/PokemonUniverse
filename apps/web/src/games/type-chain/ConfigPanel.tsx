import type { TypeChainConfig } from '@pokemon-universe/shared';
import { GenerationSelector } from '../../components/GenerationSelector';
import { Clock3, Link2 } from 'lucide-react';

const turnTimes = [10, 15, 20, 30, 45];

export function TypeChainConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeChainConfig;
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones del pool" description="Limita el starter, las respuestas y el cálculo de continuaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <section><span className="label">Tiempo por turno</span><div className="grid grid-cols-5 gap-2">{turnTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.turnSeconds === seconds} onClick={() => void onChange({ ...value, turnSeconds: seconds })} className={`min-h-11 rounded-xl border font-extrabold ${value.turnSeconds === seconds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65'}`}>{seconds}s</button>)}</div></section>
    <div className="flex items-start gap-3 rounded-2xl border border-aqua/20 bg-aqua/[0.07] p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-aqua/15 text-aqua"><Link2 /></span><div><strong className="font-display text-xl">Exactamente un tipo compartido</strong><p className="text-sm font-bold text-ink/65">Los Pokémon usados quedan bloqueados globalmente. Si la cadena se atasca, el servidor crea otra sin eliminar a nadie.</p><span className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-electric"><Clock3 size={15} /> Cooldown de 1 segundo tras cada fallo</span></div></div>
  </fieldset>;
}
