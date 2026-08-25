import type { OneOfUsIsFakeConfig, RoomView } from '@pokemon-universe/shared';
import { Clock3, MessagesSquare, ShieldQuestion, Sparkles, Tags } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { GenerationSelector } from '../../components/GenerationSelector';
import { CustomCategoryManager } from './CustomCategoryManager';

const selectionTimes = [15, 30, 45, 60];
const discussionTimes = [60, 120, 180, 240, 300];
const roundPresets = [5, 10, 15];
const categorySources = [
  { id: 'OFFICIAL', title: 'Catálogo oficial', detail: 'Prompts incluidos y listos para jugar.' },
  { id: 'CUSTOM', title: 'Mis categorías', detail: 'Solo las categorías activas del host.' },
  { id: 'BOTH', title: 'Ambas', detail: 'Mezcla catálogo oficial y categorías del host.' },
] as const;

export function OneOfUsIsFakeConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as OneOfUsIsFakeConfig;
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  const registeredHost = isHost && user?.kind === 'USER';
  return <fieldset disabled={disabled} className="space-y-7">
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada elección debe existir en este pool; la interpretación de la categoría siempre es libre." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-6 xl:grid-cols-2">
      <section aria-labelledby="fake-select-time"><div className="mb-2 flex items-center gap-2"><Clock3 className="text-aqua" size={19} /><span id="fake-select-time" className="font-extrabold">Tiempo para elegir</span></div><div className="grid grid-cols-4 gap-2">{selectionTimes.map((seconds) => <OptionButton key={seconds} selected={value.selectionSeconds === seconds} onClick={() => void onChange({ ...value, selectionSeconds: seconds })}>{seconds}s</OptionButton>)}</div></section>
      <section aria-labelledby="fake-discussion-time"><div className="mb-2 flex items-center gap-2"><MessagesSquare className="text-aqua" size={19} /><span id="fake-discussion-time" className="font-extrabold">Tiempo de discusión</span></div><div className="grid grid-cols-5 gap-2">{discussionTimes.map((seconds) => <OptionButton key={seconds} selected={value.discussionSeconds === seconds} onClick={() => void onChange({ ...value, discussionSeconds: seconds })}>{seconds}s</OptionButton>)}</div></section>
    </div>
    <section aria-labelledby="fake-rounds"><div className="mb-2 flex items-center gap-2"><ShieldQuestion className="text-aqua" size={19} /><span id="fake-rounds" className="font-extrabold">Rondas</span></div><div className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(8rem,1fr)]">{roundPresets.map((rounds) => <OptionButton key={rounds} selected={value.rounds === rounds} onClick={() => void onChange({ ...value, rounds })}>{rounds}</OptionButton>)}<label><span className="sr-only">Número personalizado de rondas</span><input className="field min-h-11 text-center font-extrabold" type="number" min={1} max={30} value={value.rounds} onChange={(event) => { const rounds = Number(event.target.value); if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 30) void onChange({ ...value, rounds }); }} /></label></div></section>
    <button type="button" aria-pressed={value.fakeKnows} onClick={() => void onChange({ ...value, fakeKnows: !value.fakeKnows })} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${value.fakeKnows ? 'border-berry/35 bg-berry/[.08]' : 'border-ink/10 bg-surface-raised'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${value.fakeKnows ? 'bg-berry text-white' : 'bg-ink/[.07]'}`}><ShieldQuestion size={20} /></span><span className="min-w-0 flex-1"><strong className="block font-display text-lg">El fake sabe que es fake</strong><small className="block font-bold text-ink/65">Por defecto nadie sabe si recibió la categoría diferente.</small></span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${value.fakeKnows ? 'bg-berry text-white' : 'bg-ink/10 text-ink/55'}`}>{value.fakeKnows ? 'ON' : 'OFF'}</span></button>
    <section aria-labelledby="category-source"><div className="mb-3 flex items-center gap-2"><Tags className="text-aqua" size={19} /><span id="category-source" className="font-extrabold">Fuente de categorías</span></div><div className="grid gap-2 md:grid-cols-3">{categorySources.map((source) => <button type="button" key={source.id} aria-pressed={value.categorySource === source.id} onClick={() => void onChange({ ...value, categorySource: source.id })} className={`min-h-24 rounded-xl border p-3 text-left ${value.categorySource === source.id ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised hover:border-aqua/50'}`}><strong className="block font-display text-lg">{source.title}</strong><small className="mt-1 block font-bold leading-snug text-ink/60">{source.detail}</small></button>)}</div>
      {registeredHost ? <div className="mt-4"><CustomCategoryManager disabled={disabled} /></div> : <p className="mt-4 rounded-xl bg-ink/[.04] p-3 text-sm font-bold text-ink/65">{isHost ? 'Crea una cuenta para guardar categorías personales de forma permanente.' : `Las categorías personales pertenecen al host. Hay ${room.hostCustomCategoryCount ?? 0} activas.`}</p>}
    </section>
    <button type="button" aria-pressed={value.includeRegionalForms} onClick={() => void onChange({ ...value, includeRegionalForms: !value.includeRegionalForms })} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-left ${value.includeRegionalForms ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${value.includeRegionalForms ? 'bg-aqua text-night' : 'bg-ink/[.07]'}`}><Sparkles size={20} /></span><span className="min-w-0 flex-1"><strong className="block font-display text-lg">Formas regionales</strong><small className="block font-bold text-ink/65">Cada forma se considera una elección exacta e independiente.</small></span><span className="font-black text-leaf">{value.includeRegionalForms ? '✓' : ''}</span></button>
  </fieldset>;
}

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border font-extrabold ${selected ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{children}</button>;
}
