import type { OneOfUsIsFakeConfig, RoomView, SubjectivePromptSource } from '@pokemon-universe/shared/public';
import { useAuth } from '../../auth/AuthContext';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented, Toggle } from '../../ui';
import { CustomCategoryManager } from './CustomCategoryManager';
import s from './ConfigPanel.module.css';

const categorySources: Array<{ id: SubjectivePromptSource; title: string; detail: string }> = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Categorías incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Propias', detail: 'Solo las categorías activas del host (al menos 2).' },
  { id: 'BOTH', title: 'Ambas', detail: 'Mezcla el catálogo oficial con las categorías del host.' },
];

const seconds = (value: number) => `${value} segundos`;
const minutes = (value: number) => (value < 60 ? seconds(value) : value % 60 === 0 ? `${value / 60} min` : `${Math.floor(value / 60)} min ${value % 60} s`);

/**
 * Ajustes de One of Us Is Fake con los controles del catálogo: generaciones (el selector heredado, F9), rondas y tiempos
 * (`ConfigRange`, que incluyen los valores de los antiguos atajos), si el fake sabe que lo es y las formas regionales
 * (`Toggle`), la fuente de categorías (`Segmented`, con el detalle de la elegida) y el gestor de categorías del host.
 */
export function OneOfUsIsFakeConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as OneOfUsIsFakeConfig;
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  const registeredHost = isHost && user?.kind === 'USER';
  const source = categorySources.find((entry) => entry.id === value.categorySource) ?? categorySources[0]!;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada elección debe existir en este pool; la interpretación de la categoría siempre es libre." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={s.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={30} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para elegir" value={value.selectionSeconds} min={15} max={120} step={5} disabled={disabled} formatValue={seconds} hint="La revelación empieza antes si todos han elegido." onCommit={(selectionSeconds) => onChange({ ...value, selectionSeconds })} />
      <ConfigRange label="Tiempo de debate y voto" value={value.discussionSeconds} min={30} max={600} step={15} disabled={disabled} formatValue={minutes} hint="Con empate hay otra vuelta con el mismo tiempo." onCommit={(discussionSeconds) => onChange({ ...value, discussionSeconds })} />
    </div>
    <Toggle label="El fake sabe que es fake" hint="Por defecto nadie sabe si recibió la categoría diferente." checked={value.fakeKnows} disabled={disabled} onChange={(fakeKnows) => void onChange({ ...value, fakeKnows })} />
    <div className={s.field}>
      <span className={s.label}>Fuente de categorías</span>
      <Segmented label="Fuente de categorías" value={value.categorySource} options={categorySources.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={(categorySource) => void onChange({ ...value, categorySource })} />
      <p className={s.help}>{source.detail}</p>
    </div>
    {registeredHost
      ? <CustomCategoryManager disabled={disabled} />
      : <p className={s.note}>{isHost ? 'Crea una cuenta para guardar categorías personales de forma permanente.' : `Las categorías personales pertenecen al host. Hay ${room.hostCustomCategoryCount ?? 0} activas.`}</p>}
    <Toggle label="Formas regionales" hint="Cada forma se considera una elección exacta e independiente." checked={value.includeRegionalForms} disabled={disabled} onChange={(includeRegionalForms) => void onChange({ ...value, includeRegionalForms })} />
  </fieldset>;
}
