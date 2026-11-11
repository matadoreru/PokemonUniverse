import type { RoomView, SecretRankingConfig, SubjectivePromptSource } from '@pokemon-universe/shared/public';
import { useAuth } from '../../auth/AuthContext';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented, Toggle } from '../../ui';
import { CustomCategoryManager } from '../one-of-us-is-fake/CustomCategoryManager';
import c from '../ConfigPanel.module.css';

const sources: Array<{ id: SubjectivePromptSource; title: string; detail: string }> = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Preguntas direccionales incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las preguntas activas guardadas por el host.' },
  { id: 'BOTH', title: 'Mezcladas', detail: 'Combina el catálogo oficial con las preguntas del host.' },
];

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Secret Ranking con los controles del catálogo: generaciones (el selector heredado, F9), rondas y tiempo
 * para ordenar (`ConfigRange`, de paso 1: incluye los valores de los antiguos atajos y del campo libre), fuente de
 * preguntas (`Segmented`, con el detalle de la elegida), formas alternativas (`Toggle`) y el gestor de preguntas
 * personales del host (compartido con los demás juegos subjetivos).
 */
export function SecretRankingConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as SecretRankingConfig;
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  const registeredHost = isHost && user?.kind === 'USER';
  const source = sources.find((entry) => entry.id === value.promptSource) ?? sources[0]!;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada ronda usa cinco Pokémon distintos del pool seleccionado." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para ordenar" value={value.roundSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="La ronda termina antes si todos han bloqueado su ranking." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
    </div>
    <Segmented label="Fuente de preguntas" showLabel hint={source.detail} value={value.promptSource} options={sources.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={(promptSource) => void onChange({ ...value, promptSource })} />
    {registeredHost
      ? <CustomCategoryManager disabled={disabled} minimumActive={1} title="Mis preguntas subjetivas" description="Se comparten con los demás juegos subjetivos y permanecen guardadas en tu cuenta." placeholder="De más valiente a menos valiente" emptyText="Todavía no has creado preguntas personales." newLabel="Nueva pregunta" editLabel="Editar pregunta" noun="pregunta" />
      : <p className={c.note}>{isHost ? 'Crea una cuenta para guardar preguntas personales de forma permanente.' : `Las preguntas personales pertenecen al host. Hay ${room.hostCustomCategoryCount ?? 0} activas.`}</p>}
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales y alternativas se ordenan como Pokémon independientes." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
