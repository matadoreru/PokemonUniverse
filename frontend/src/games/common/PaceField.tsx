import { Segmented } from '../../ui';
import { applyPace, CUSTOM_PACE_HINT, PACE_IDS, PACE_LABELS, paceOf, pacePresetsOf, type PaceId } from './pace-presets';

const CUSTOM = 'CUSTOM';

interface Props {
  gameId: string;
  /** La configuración del panel; puede venir incompleta (vista previa): entonces es «Personalizado». */
  config: unknown;
  disabled: boolean;
  onChange(config: unknown): void;
}

/**
 * Control «Ritmo» de arriba de los paneles: Rápido, Clásico (los valores por defecto) y Experto. Elegir uno aplica sus
 * valores de una vez; si el anfitrión cambia a mano un ajuste que cubre, ninguno queda marcado y la ayuda dice
 * «Personalizado». Sin ritmos para `gameId` no pinta nada.
 */
export function PaceField({ gameId, config, disabled, onChange }: Props) {
  const table = pacePresetsOf(gameId);
  if (!table) return null;
  const pace = paceOf(gameId, config);
  const options = PACE_IDS.map((id) => ({ value: id, label: PACE_LABELS[id], disabled }));
  return <Segmented<PaceId | typeof CUSTOM> label="Ritmo" showLabel value={pace ?? CUSTOM} options={options}
    hint={pace ? table.hints[pace] : CUSTOM_PACE_HINT}
    onChange={(next) => { if (next !== CUSTOM) onChange(applyPace(gameId, config, next)); }} />;
}
