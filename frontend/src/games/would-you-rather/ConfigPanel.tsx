import { WOULD_YOU_RATHER_MAJORITY_POINTS, WOULD_YOU_RATHER_PREDICTION_POINTS, type RoomView, type SubjectivePromptSource, type WouldYouRatherConfig } from '@pokemon-universe/shared/public';
import { useAuth } from '../../auth/AuthContext';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented } from '../../ui';
import { CustomWouldYouRatherPromptManager } from './CustomPromptManager';
import s from './ConfigPanel.module.css';

const sources: Array<{ id: SubjectivePromptSource; title: string; detail: string }> = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Dilemas normales, adultos y de humor oscuro.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las parejas activas del anfitrión.' },
  { id: 'BOTH', title: 'Mezclados', detail: 'Combina el catálogo oficial con el personal.' },
];

const seconds = (value: number) => `${value} segundos`;

/**
 * Ajustes de Would You Rather con los controles del catálogo: rondas y tiempo (`ConfigRange`), fuente de dilemas
 * (`Segmented`, con el detalle de la elegida), el gestor de dilemas personales del host registrado y la regla de puntos.
 */
export function WouldYouRatherConfigPanel({ config, disabled, room, selfId, onChange }: { config: unknown; disabled: boolean; room: RoomView; selfId: string; onChange(config: unknown): Promise<void> }) {
  const value = config as WouldYouRatherConfig;
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  const registeredHost = isHost && user?.kind === 'USER';
  const source = sources.find((entry) => entry.id === value.promptSource) ?? sources[0]!;
  return <fieldset disabled={disabled} className={s.panel}>
    <div className={s.pair}>
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={10} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label="Tiempo para votar y predecir" value={value.roundSeconds} min={15} max={120} disabled={disabled} formatValue={seconds} hint="La ronda termina antes si todos han enviado su papeleta." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
    </div>
    <Segmented label="Fuente de dilemas" showLabel hint={source.detail} value={value.promptSource} options={sources.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={(promptSource) => void onChange({ ...value, promptSource })} />
    {registeredHost
      ? <CustomWouldYouRatherPromptManager disabled={disabled} />
      : <p className={s.note}>{isHost ? 'Crea una cuenta para guardar dilemas personales de forma permanente.' : `Los dilemas personales pertenecen al host. Hay ${room.hostWouldYouRatherPromptCount ?? 0} activos.`}</p>}
    <p className={s.note}>La papeleta combina tu elección y tu predicción. Se bloquea al enviarla y permanece secreta hasta el resultado. Acertar la mayoría vale {WOULD_YOU_RATHER_PREDICTION_POINTS} puntos; formar parte de ella, {WOULD_YOU_RATHER_MAJORITY_POINTS}.</p>
  </fieldset>;
}
