import type { MostLikelyToConfig, RoomView, SubjectivePromptSource } from '@pokemon-universe/shared/public';
import { useAuth } from '../../auth/AuthContext';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented, Toggle } from '../../ui';
import { CustomCategoryManager } from '../one-of-us-is-fake/CustomCategoryManager';
import c from '../ConfigPanel.module.css';

const sources: Array<{ id: SubjectivePromptSource; title: string; detail: string }> = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Situaciones incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las preguntas activas del anfitrión.' },
  { id: 'BOTH', title: 'Mezcladas', detail: 'Combina el catálogo oficial con el personal.' },
];

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Most Likely To con los controles del catálogo: generaciones (el selector heredado, F9), rondas y tiempos
 * (`ConfigRange`), fuente de preguntas (`Segmented`, con el detalle de la elegida), formas alternativas (`Toggle`) y el
 * gestor de preguntas personales del host (compartido con One of Us Is Fake).
 */
export function MostLikelyToConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as MostLikelyToConfig;
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  const registeredHost = isHost && user?.kind === 'USER';
  const source = sources.find((entry) => entry.id === value.promptSource) ?? sources[0]!;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada jugador busca su respuesta dentro de este pool; las elecciones duplicadas están permitidas." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para responder" value={value.selectionSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="La votación empieza antes si todos han respondido." onCommit={(selectionSeconds) => onChange({ ...value, selectionSeconds })} />
      <ConfigRange label="Tiempo para votar" value={value.votingSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="Con empate hay una segunda vuelta con el mismo tiempo." onCommit={(votingSeconds) => onChange({ ...value, votingSeconds })} />
    </div>
    <Segmented label="Fuente de preguntas" showLabel hint={source.detail} value={value.promptSource} options={sources.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={(promptSource) => void onChange({ ...value, promptSource })} />
    {registeredHost
      ? <CustomCategoryManager disabled={disabled} minimumActive={1} title="Mis preguntas subjetivas" description="Se comparten con los demás juegos subjetivos y permanecen guardadas en tu cuenta." placeholder="¿Qué Pokémon sería más probable que montase una banda?" emptyText="Todavía no has creado preguntas personales." newLabel="Nueva pregunta" editLabel="Editar pregunta" noun="pregunta" />
      : <p className={c.note}>{isHost ? 'Crea una cuenta para guardar preguntas personales de forma permanente.' : `Las preguntas personales pertenecen al host. Hay ${room.hostCustomCategoryCount ?? 0} activas.`}</p>}
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales y alternativas son respuestas independientes." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
