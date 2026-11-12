import type { RoomView, SecretRankingConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { Toggle } from '../../ui';
import { CustomCategoryManager } from '../prompt-source/CustomCategoryManager';
import c from '../ConfigPanel.module.css';
import { PromptSourceField, type PromptSourceOption } from '../prompt-source/PromptSourceField';
import { roundsLabel, secondsLabel } from '../../lib/format';
import { PaceField } from '../common/PaceField';

const sources: PromptSourceOption[] = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Preguntas direccionales incluidas y listas para jugar.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las preguntas activas guardadas por el host.' },
  { id: 'BOTH', title: 'Mezcladas', detail: 'Combina el catálogo oficial con las preguntas del host.' },
];

/**
 * Ajustes de Secret Ranking con los controles del catálogo: generaciones (el selector heredado, F9), rondas y tiempo
 * para ordenar (`ConfigRange`, de paso 1: incluye los valores de los antiguos atajos y del campo libre), fuente de
 * preguntas (`PromptSourceField`, con el detalle de la elegida), formas alternativas (`Toggle`) y el gestor de preguntas
 * personales del host (compartido con los demás juegos subjetivos).
 */
export function SecretRankingConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as SecretRankingConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <PaceField gameId="secret-ranking" config={value} disabled={disabled} onChange={(next) => void onChange(next)} />
    <GenerationSelector selected={value.generations} label="Generaciones" description="Cada ronda usa cinco Pokémon distintos del pool seleccionado." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para ordenar" value={value.roundSeconds} min={15} max={120} disabled={disabled} formatValue={secondsLabel} hint="La ronda termina antes si todos han bloqueado su ranking." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
    </div>
    <PromptSourceField label="Fuente de preguntas" sources={sources} value={value.promptSource} disabled={disabled} onChange={(promptSource) => void onChange({ ...value, promptSource })} room={room} selfId={selfId}
      noun="preguntas" hostCount={room.hostCustomCategoryCount} manager={<CustomCategoryManager disabled={disabled} minimumActive={1} title="Mis preguntas subjetivas" description="Se comparten con los demás juegos subjetivos y permanecen guardadas en tu cuenta." placeholder="De más valiente a menos valiente" emptyText="Todavía no has creado preguntas personales." newLabel="Nueva pregunta" editLabel="Editar pregunta" noun="pregunta" />} />
    <Toggle label="Incluir formas alternativas" hint="Las formas regionales y alternativas se ordenan como Pokémon independientes." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
  </fieldset>;
}
