import type { RoomView, SecretRankingConfig, SubjectivePromptSource } from '@pokemon-universe/shared';
import { Clock3, ListOrdered, Sparkles, Tags } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { GenerationSelector } from '../../components/GenerationSelector';
import { CustomCategoryManager } from '../one-of-us-is-fake/CustomCategoryManager';

const roundPresets = [1, 3, 5, 10];
const timePresets = [30, 45, 60, 90];
const sources: Array<{ id: SubjectivePromptSource; title: string; detail: string }> = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Preguntas direccionales incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las preguntas activas guardadas por el host.' },
  { id: 'BOTH', title: 'Mezcladas', detail: 'Combina el catálogo oficial con las preguntas del host.' },
];

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border font-extrabold transition-colors ${selected ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{children}</button>;
}

export function SecretRankingConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as SecretRankingConfig;
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  const registeredHost = isHost && user?.kind === 'USER';
  return <fieldset disabled={disabled} className="space-y-7">
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada ronda usa cinco Pokémon distintos del pool seleccionado." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="secret-ranking-rounds"><div className="mb-2 flex items-center gap-2"><ListOrdered className="text-aqua" size={19} /><span id="secret-ranking-rounds" className="font-extrabold">Rondas</span></div><div className="grid grid-cols-5 gap-2">{roundPresets.map((rounds) => <OptionButton key={rounds} selected={value.rounds === rounds} onClick={() => void onChange({ ...value, rounds })}>{rounds}</OptionButton>)}<label><span className="sr-only">Número personalizado de rondas</span><input className="field min-h-11 text-center font-extrabold" type="number" min={1} max={10} value={value.rounds} onChange={(event) => { const rounds = Number(event.target.value); if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 10) void onChange({ ...value, rounds }); }} /></label></div></section>
      <section aria-labelledby="secret-ranking-time"><div className="mb-2 flex items-center gap-2"><Clock3 className="text-aqua" size={19} /><span id="secret-ranking-time" className="font-extrabold">Tiempo para ordenar</span></div><div className="grid grid-cols-5 gap-2">{timePresets.map((roundSeconds) => <OptionButton key={roundSeconds} selected={value.roundSeconds === roundSeconds} onClick={() => void onChange({ ...value, roundSeconds })}>{roundSeconds}s</OptionButton>)}<label><span className="sr-only">Tiempo personalizado por ronda</span><input className="field min-h-11 text-center font-extrabold" type="number" min={15} max={120} value={value.roundSeconds} onChange={(event) => { const roundSeconds = Number(event.target.value); if (Number.isInteger(roundSeconds) && roundSeconds >= 15 && roundSeconds <= 120) void onChange({ ...value, roundSeconds }); }} /></label></div></section>
    </div>
    <section aria-labelledby="secret-ranking-source"><div className="mb-3 flex items-center gap-2"><Tags className="text-aqua" size={19} /><span id="secret-ranking-source" className="font-extrabold">Fuente de preguntas</span></div><div className="grid gap-2 md:grid-cols-3">{sources.map((source) => <button type="button" key={source.id} aria-pressed={value.promptSource === source.id} onClick={() => void onChange({ ...value, promptSource: source.id })} className={`min-h-24 rounded-xl border p-3 text-left transition-colors ${value.promptSource === source.id ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised hover:border-aqua/50'}`}><strong className="block font-display text-lg">{source.title}</strong><small className="mt-1 block font-bold leading-snug text-ink/60">{source.detail}</small></button>)}</div>
      {registeredHost ? <div className="mt-4"><CustomCategoryManager disabled={disabled} minimumActive={1} title="Mis preguntas subjetivas" description="Se comparten con los demás juegos subjetivos y permanecen guardadas en tu cuenta." placeholder="De más valiente a menos valiente" emptyText="Todavía no has creado preguntas personales." /></div> : <p className="mt-4 rounded-xl bg-ink/[.04] p-3 text-sm font-bold text-ink/65">{isHost ? 'Crea una cuenta para guardar preguntas personales de forma permanente.' : `Las preguntas personales pertenecen al host. Hay ${room.hostCustomCategoryCount ?? 0} activas.`}</p>}
    </section>
    <button type="button" aria-pressed={value.includeForms} onClick={() => void onChange({ ...value, includeForms: !value.includeForms })} className={`flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${value.includeForms ? 'border-aqua bg-aqua/10' : 'border-ink/10 bg-surface-raised hover:border-aqua/45'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${value.includeForms ? 'bg-aqua text-night' : 'bg-ink/[.07]'}`}><Sparkles size={20} /></span><span className="min-w-0 flex-1"><strong className="block font-display text-lg">Incluir formas alternativas</strong><small className="block font-bold text-ink/65">Las formas regionales y alternativas se ordenan como Pokémon independientes.</small></span><span className="font-black text-leaf">{value.includeForms ? '✓' : ''}</span></button>
  </fieldset>;
}
