import { Toggle } from '../../ui';

/**
 * Ajuste «Intentos públicos» de los juegos de adivinar (panel de ajustes del lobby). Apagado, el servidor no envía los
 * fallos de nadie a los demás y la pantalla no pinta el panel lateral de intentos.
 */
export function PublicAttemptsToggle({ checked, disabled, onChange }: { checked: boolean | undefined; disabled: boolean; onChange(publicAttempts: boolean): void }) {
  return <Toggle label="Intentos públicos" hint="Si lo apagas, nadie ve los fallos de los demás." checked={checked !== false} disabled={disabled} onChange={onChange} />;
}
