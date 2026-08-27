import type { PokemonConnectionsConfig } from '@pokemon-universe/shared';
import { Boxes, Clock3, Grid3X3, RotateCw, ShieldAlert } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';

const groupSizes = [3, 4, 5] as const;
const groupCounts = [3, 4, 5] as const;
const mistakeOptions = [2, 3, 4, 5, 6] as const;
const timeOptions = [60, 90, 120, 180, 240] as const;
const roundOptions = [3, 5, 10] as const;

function OptionButton({ selected, children, onClick }: { selected: boolean; children: React.ReactNode; onClick(): void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border px-3 font-extrabold transition-colors ${selected ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/65 hover:border-aqua'}`}>{children}</button>;
}

export function PokemonConnectionsConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonConnectionsConfig;
  const groupCount = value.pokemonCount / value.groupSize;
  return <fieldset disabled={disabled} className="space-y-7">
    <GenerationSelector selected={value.generations} label="Generaciones del tablero" description="Los puzles curados se usan cuando encajan; el generador completa el resto usando únicamente este pool." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="connections-group-size"><div className="mb-2 flex items-center gap-2"><Boxes className="text-aqua" size={19} /><span id="connections-group-size" className="font-extrabold">Pokémon por grupo</span></div><div className="grid grid-cols-3 gap-2">{groupSizes.map((size) => <OptionButton key={size} selected={value.groupSize === size} onClick={() => void onChange({ ...value, groupSize: size, pokemonCount: size * Math.min(5, Math.max(3, Math.round(groupCount))) })}>{size}</OptionButton>)}</div></section>
      <section aria-labelledby="connections-board-size"><div className="mb-2 flex items-center gap-2"><Grid3X3 className="text-aqua" size={19} /><span id="connections-board-size" className="font-extrabold">Total del tablero</span></div><div className="grid grid-cols-3 gap-2">{groupCounts.map((count) => { const total = count * value.groupSize; return <OptionButton key={count} selected={value.pokemonCount === total} onClick={() => void onChange({ ...value, pokemonCount: total })}>{total}<small className="ml-1 opacity-70">({count} grupos)</small></OptionButton>; })}</div></section>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="connections-mistakes"><div className="mb-2 flex items-center gap-2"><ShieldAlert className="text-aqua" size={19} /><span id="connections-mistakes" className="font-extrabold">Errores permitidos</span></div><div className="grid grid-cols-5 gap-2">{mistakeOptions.map((mistakesAllowed) => <OptionButton key={mistakesAllowed} selected={value.mistakesAllowed === mistakesAllowed} onClick={() => void onChange({ ...value, mistakesAllowed })}>{mistakesAllowed}</OptionButton>)}</div><p className="mt-2 text-sm font-bold text-ink/60">Un intento con todos menos uno del mismo grupo mostrará «Te falta uno».</p></section>
      <section aria-labelledby="connections-time"><div className="mb-2 flex items-center gap-2"><Clock3 className="text-aqua" size={19} /><span id="connections-time" className="font-extrabold">Tiempo por puzle</span></div><div className="grid grid-cols-5 gap-2">{timeOptions.map((roundSeconds) => <OptionButton key={roundSeconds} selected={value.roundSeconds === roundSeconds} onClick={() => void onChange({ ...value, roundSeconds })}>{roundSeconds >= 60 ? `${roundSeconds / 60}m` : `${roundSeconds}s`}</OptionButton>)}</div></section>
    </div>
    <section aria-labelledby="connections-rounds"><div className="mb-2 flex items-center gap-2"><RotateCw className="text-aqua" size={19} /><span id="connections-rounds" className="font-extrabold">Número de puzles</span></div><div className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(8rem,1fr)]">{roundOptions.map((rounds) => <OptionButton key={rounds} selected={value.rounds === rounds} onClick={() => void onChange({ ...value, rounds })}>{rounds}</OptionButton>)}<label><span className="sr-only">Número personalizado de puzles</span><input className="field min-h-11 text-center font-extrabold" type="number" min={1} max={20} value={value.rounds} onChange={(event) => { const rounds = Number(event.target.value); if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 20) void onChange({ ...value, rounds }); }} /></label></div></section>
  </fieldset>;
}
