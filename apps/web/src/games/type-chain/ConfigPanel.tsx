import { GENERATIONS, type TypeChainConfig } from '@pokemon-universe/shared';
import { Clock3, Link2 } from 'lucide-react';

const turnTimes = [10, 15, 20, 30, 45];

export function TypeChainConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as TypeChainConfig;
  function toggleGeneration(generation: number) {
    const generations = value.generations.includes(generation) ? value.generations.filter((item) => item !== generation) : [...value.generations, generation];
    if (generations.length) void onChange({ ...value, generations });
  }
  return <fieldset disabled={disabled} className="space-y-6">
    <section><span className="label">Generaciones del pool</span><p className="mb-3 text-sm font-bold text-ink/45">Limita el starter, las respuestas y el cálculo de continuaciones.</p><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{GENERATIONS.map((generation) => <button type="button" key={generation} aria-pressed={value.generations.includes(generation)} onClick={() => toggleGeneration(generation)} className={`min-h-11 rounded-xl border-2 py-2 font-bold ${value.generations.includes(generation) ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised text-ink/45'}`}>Gen {generation}</button>)}</div></section>
    <section><span className="label">Tiempo por turno</span><div className="grid grid-cols-5 gap-2">{turnTimes.map((seconds) => <button type="button" key={seconds} aria-pressed={value.turnSeconds === seconds} onClick={() => void onChange({ ...value, turnSeconds: seconds })} className={`min-h-11 rounded-xl border-2 font-extrabold ${value.turnSeconds === seconds ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/50'}`}>{seconds}s</button>)}</div></section>
    <div className="flex items-start gap-3 rounded-2xl border border-aqua/20 bg-aqua/[0.07] p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-aqua/15 text-aqua"><Link2 /></span><div><strong className="font-display text-xl">Exactamente un tipo compartido</strong><p className="text-sm font-bold text-ink/45">Los Pokémon usados quedan bloqueados globalmente. Si la cadena se atasca, el servidor crea otra sin eliminar a nadie.</p><span className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-electric"><Clock3 size={15} /> Cooldown de 1 segundo tras cada fallo</span></div></div>
  </fieldset>;
}
