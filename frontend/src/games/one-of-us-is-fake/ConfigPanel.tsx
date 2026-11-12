import type { OneOfUsIsFakeConfig, RoomView } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { Toggle } from '../../ui';
import { CustomCategoryManager } from '../prompt-source/CustomCategoryManager';
import c from '../ConfigPanel.module.css';
import { PromptSourceField, type PromptSourceOption } from '../prompt-source/PromptSourceField';
import { roundsLabel, secondsLabel } from '../../lib/format';
import { PaceField } from '../common/PaceField';

const categorySources: PromptSourceOption[] = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Categorías incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Propias', detail: 'Solo las categorías activas del host (al menos 2).' },
  { id: 'BOTH', title: 'Ambas', detail: 'Mezcla el catálogo oficial con las categorías del host.' },
];

const minutes = (value: number) => (value < 60 ? secondsLabel(value) : value % 60 === 0 ? `${value / 60} min` : `${Math.floor(value / 60)} min ${value % 60} s`);

/**
 * Ajustes de One of Us Is Fake con los controles del catálogo: generaciones (el selector heredado, F9), rondas y tiempos
 * (`ConfigRange`, que incluyen los valores de los antiguos atajos), si el fake sabe que lo es y las formas regionales
 * (`Toggle`), la fuente de categorías (`PromptSourceField`, con el detalle de la elegida) y el gestor de categorías del host.
 */
export function OneOfUsIsFakeConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as OneOfUsIsFakeConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <PaceField gameId="one-of-us-is-fake" config={value} disabled={disabled} onChange={(next) => void onChange(next)} />
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada elección debe existir en este pool; la interpretación de la categoría siempre es libre." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={30} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para elegir" value={value.selectionSeconds} min={15} max={120} step={5} disabled={disabled} formatValue={secondsLabel} hint="La revelación empieza antes si todos han elegido." onCommit={(selectionSeconds) => onChange({ ...value, selectionSeconds })} />
      <ConfigRange label="Tiempo de debate y voto" value={value.discussionSeconds} min={30} max={600} step={15} disabled={disabled} formatValue={minutes} hint="Con empate hay otra vuelta con el mismo tiempo." onCommit={(discussionSeconds) => onChange({ ...value, discussionSeconds })} />
    </div>
    <Toggle label="El fake sabe que es fake" hint="Por defecto nadie sabe si recibió la categoría diferente." checked={value.fakeKnows} disabled={disabled} onChange={(fakeKnows) => void onChange({ ...value, fakeKnows })} />
    <PromptSourceField label="Fuente de categorías" sources={categorySources} value={value.categorySource} disabled={disabled} onChange={(categorySource) => void onChange({ ...value, categorySource })} room={room} selfId={selfId}
      noun="categorías" hostCount={room.hostCustomCategoryCount} manager={<CustomCategoryManager disabled={disabled} />} />
    <Toggle label="Formas regionales" hint="Cada forma se considera una elección exacta e independiente." checked={value.includeRegionalForms} disabled={disabled} onChange={(includeRegionalForms) => void onChange({ ...value, includeRegionalForms })} />
  </fieldset>;
}
