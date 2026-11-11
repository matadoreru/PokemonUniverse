import type { RoomView, SubjectivePromptSource } from '@pokemon-universe/shared/public';
import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Segmented } from '../../ui';
import c from '../ConfigPanel.module.css';

export interface PromptSourceOption {
  id: SubjectivePromptSource;
  title: string;
  detail: string;
}

/**
 * Si quien ajusta es el host y si además tiene cuenta: solo un host registrado guarda textos personales en su cuenta.
 */
export function useRegisteredHost(room: RoomView, selfId: string): { isHost: boolean; registeredHost: boolean } {
  const { user } = useAuth();
  const isHost = room.hostId === selfId;
  return { isHost, registeredHost: isHost && user?.kind === 'USER' };
}

interface Props {
  label: string;
  sources: PromptSourceOption[];
  value: SubjectivePromptSource;
  disabled: boolean;
  onChange(source: SubjectivePromptSource): void;
  room: RoomView;
  selfId: string;
  /** El gestor de textos personales, que solo ve el host registrado. */
  manager: ReactNode;
  /** Los textos personales en plural («preguntas», «categorías», «dilemas»). */
  noun: string;
  /** Si `noun` es masculino («Los dilemas… activos»). */
  masculine?: boolean;
  /** Cuántos tiene activos el host, para quien no es el host. */
  hostCount: number | undefined;
}

/**
 * Fuente de los textos de un juego subjetivo (`Segmented` con el detalle de la elegida) y, debajo, el gestor de textos
 * personales para el host registrado; al host sin cuenta, la invitación a crearla, y a los demás, cuántos tiene activos.
 */
export function PromptSourceField({ label, sources, value, disabled, onChange, room, selfId, manager, noun, masculine, hostCount }: Props) {
  const { isHost, registeredHost } = useRegisteredHost(room, selfId);
  const source = sources.find((entry) => entry.id === value) ?? sources[0]!;
  const article = masculine ? 'Los' : 'Las';
  const active = masculine ? 'activos' : 'activas';
  return <>
    <Segmented label={label} showLabel hint={source.detail} value={value} options={sources.map((entry) => ({ value: entry.id, label: entry.title, disabled }))} onChange={onChange} />
    {registeredHost
      ? manager
      : <p className={c.note}>{isHost ? `Crea una cuenta para guardar ${noun} personales de forma permanente.` : `${article} ${noun} personales pertenecen al host. Hay ${hostCount ?? 0} ${active}.`}</p>}
  </>;
}
