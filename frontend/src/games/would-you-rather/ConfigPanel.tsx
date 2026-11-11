import { WOULD_YOU_RATHER_MAJORITY_POINTS, WOULD_YOU_RATHER_PREDICTION_POINTS, type RoomView, type WouldYouRatherConfig } from '@pokemon-universe/shared/public';
import { ConfigRange } from '../../room/ConfigRange';
import { CustomWouldYouRatherPromptManager } from './CustomPromptManager';
import c from '../ConfigPanel.module.css';
import { PromptSourceField, type PromptSourceOption } from '../prompt-source/PromptSourceField';

const sources: PromptSourceOption[] = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Dilemas normales, adultos y de humor oscuro.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las parejas activas del anfitrión.' },
  { id: 'BOTH', title: 'Mezclados', detail: 'Combina el catálogo oficial con el personal.' },
];

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Would You Rather con los controles del catálogo: rondas y tiempo (`ConfigRange`), fuente de dilemas
 * (`PromptSourceField`, con el detalle de la elegida), el gestor de dilemas personales del host registrado y la regla de puntos.
 */
export function WouldYouRatherConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as WouldYouRatherConfig;
  return <fieldset disabled={disabled} className={c.panel}>
    <div className={c.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para votar y predecir" value={value.roundSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="La ronda termina antes si todos han enviado su papeleta." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
    </div>
    <PromptSourceField label="Fuente de dilemas" sources={sources} value={value.promptSource} disabled={disabled} onChange={(promptSource) => void onChange({ ...value, promptSource })} room={room} selfId={selfId}
      noun="dilemas" masculine hostCount={room.hostWouldYouRatherPromptCount} manager={<CustomWouldYouRatherPromptManager disabled={disabled} />} />
    <p className={c.note}>La papeleta combina tu elección y tu predicción. Se bloquea al enviarla y permanece secreta hasta el resultado. Acertar la mayoría vale {WOULD_YOU_RATHER_PREDICTION_POINTS} puntos; formar parte de ella, {WOULD_YOU_RATHER_MAJORITY_POINTS}.</p>
  </fieldset>;
}
