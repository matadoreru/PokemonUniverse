import type { PokemonBluffAuctionConfig } from '@pokemon-universe/shared';
import { Clock3, Layers3, ShieldCheck } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';

const times = [20, 30, 45, 60];
const rounds = [5, 10, 15, 20];

export function PokemonBluffAuctionConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonBluffAuctionConfig;
  return <fieldset disabled={disabled} className="space-y-7">
    <GenerationSelector selected={value.generations} label="Generaciones" description="La condición y el buscador usarán únicamente especies normales de estas generaciones." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="bluff-time"><div className="mb-2 flex items-center gap-2"><Clock3 className="text-aqua" size={19} /><span id="bluff-time" className="font-extrabold">Tiempo inicial para demostrar</span></div><div className="grid grid-cols-4 gap-2">{times.map((seconds) => <Option key={seconds} selected={value.demonstrationSeconds === seconds} onClick={() => void onChange({ ...value, demonstrationSeconds: seconds })}>{seconds}s</Option>)}</div><p className="mt-2 text-sm font-bold text-ink/60">Cada Pokémon nuevo enviado añade 5 segundos.</p></section>
      <section aria-labelledby="bluff-rounds"><div className="mb-2 flex items-center gap-2"><Layers3 className="text-aqua" size={19} /><span id="bluff-rounds" className="font-extrabold">Rondas</span></div><div className="grid grid-cols-4 gap-2">{rounds.map((count) => <Option key={count} selected={value.rounds === count} onClick={() => void onChange({ ...value, rounds: count })}>{count}</Option>)}</div><p className="mt-2 text-sm font-bold text-ink/60">Cada ronda renueva condición y orden de puja.</p></section>
    </div>
    <div className="flex items-start gap-3 rounded-xl border border-leaf/20 bg-leaf/[.06] p-4"><ShieldCheck className="mt-0.5 shrink-0 text-leaf" size={21} /><div><strong className="block">Solo especies normales</strong><p className="mt-1 text-sm font-bold leading-relaxed text-ink/65">Este modo excluye regionales, Mega, Gigamax y cualquier variante que comparta número de Pokédex. Las condiciones se verifican con datos autoritativos.</p></div></div>
  </fieldset>;
}

function Option({ selected, onClick, children }: { selected: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border font-extrabold ${selected ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{children}</button>;
}
