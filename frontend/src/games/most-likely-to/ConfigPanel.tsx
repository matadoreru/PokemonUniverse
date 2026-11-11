import type { MostLikelyToConfig, RoomView } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { Toggle } from '../../ui';
import { CustomCategoryManager } from '../prompt-source/CustomCategoryManager';
import c from '../ConfigPanel.module.css';
import { PromptSourceField, type PromptSourceOption } from '../prompt-source/PromptSourceField';
import { roundsLabel, secondsLabel } from '../../lib/format';

const sources: PromptSourceOption[] = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Situaciones incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las preguntas activas del anfitrión.' },
  { id: 'BOTH', title: 'Mezcladas', detail: 'Combina el catálogo oficial con el personal.' },
];

/**
 * Ajustes de Most Likely To con los controles del catálogo: generaciones (el selector heredado, F9), rondas y tiempos
 * (`ConfigRange`), fuente de preguntas (`PromptSourceField`, con el detalle de la elegida), formas alternativas (`Toggle`) y el
 * gestor de preguntas personales del host (compartido con One of Us Is Fake).
 */
export function MostLikelyToConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as MostLikelyToConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada jugador busca su respuesta dentro de este pool; las elecciones duplicadas están permitidas." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para responder" value={value.selectionSeconds} min={15} max={120} disabled={disabled} formatValue={secondsLabel} hint="La votación empieza antes si todos han respondido." onCommit={(selectionSeconds) => onChange({ ...value, selectionSeconds })} />
      <ConfigRange label="Tiempo para votar" value={value.votingSeconds} min={15} max={120} disabled={disabled} formatValue={secondsLabel} hint="Con empate hay una segunda vuelta con el mismo tiempo." onCommit={(votingSeconds) => onChange({ ...value, votingSeconds })} />
    </div>
    <PromptSourceField label="Fuente de preguntas" sources={sources} value={value.promptSource} disabled={disabled} onChange={(promptSource) => void onChange({ ...value, promptSource })} room={room} selfId={selfId}
      noun="preguntas" hostCount={room.hostCustomCategoryCount} manager={<CustomCategoryManager disabled={disabled} minimumActive={1} title="Mis preguntas subjetivas" description="Se comparten con los demás juegos subjetivos y permanecen guardadas en tu cuenta." placeholder="¿Qué Pokémon sería más probable que montase una banda?" emptyText="Todavía no has creado preguntas personales." newLabel="Nueva pregunta" editLabel="Editar pregunta" noun="pregunta" />} />
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales y alternativas son respuestas independientes." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
