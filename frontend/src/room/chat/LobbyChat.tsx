import { hasRoomPermission, type ChatMessage, type RoomMemberView, type RoomRole } from '@pokemon-universe/shared/public';
import { MessageSquare, MessageSquareOff, Trash2 } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { ChatComposer, ChatLog, Dialog, Panel, Pill, StateBox, type ChatLogItem } from '../../ui';
import { playerColor } from '../player-color';
import s from './LobbyChat.module.css';

/** Igual que el servidor (`RoomChat`): unidades UTF-16, como `maxLength`. */
const MAX_LENGTH = 200;
const MUTED_REASON = 'Un moderador te ha silenciado en el chat de esta sala.';

/**
 * ¿Puede quien modera borrar un mensaje? El Host, cualquiera; el Co-host, todos salvo los del Host actual. `authorRole`
 * es `null` si el autor ya salió de la sala (no puede ser el Host).
 */
export function canDeleteChatMessage(actorRole: RoomRole, authorRole: RoomRole | null): boolean {
  if (!hasRoomPermission(actorRole, 'MODERATE_CHAT')) return false;
  return !(actorRole === 'CO_HOST' && authorRole === 'HOST');
}

/**
 * ¿Puede silenciar (o quitar el silencio) a esa persona? Nunca al Host, a sí mismo ni a quien ya no está en la sala
 * (el servidor respondería «Player not found»); un Co-host tampoco a otro Co-host. Lo mismo que comprueba el servidor.
 */
export function canMuteInChat(actorId: string, actorRole: RoomRole, target: RoomMemberView | undefined): boolean {
  if (!target || !hasRoomPermission(actorRole, 'MODERATE_CHAT')) return false;
  if (target.id === actorId || target.roomRole === 'HOST') return false;
  return !(actorRole === 'CO_HOST' && target.roomRole === 'CO_HOST');
}

interface ChatModerationMenuProps {
  text: string;
  authorName: string;
  canDelete: boolean;
  canMute: boolean;
  muted: boolean;
  onDelete(): void;
  onToggleMute(): void;
}

/** Cuerpo del diálogo «Mensaje de X»: cita el texto y ofrece solo lo que el servidor aceptaría. */
export function ChatModerationMenu({ text, authorName, canDelete, canMute, muted, onDelete, onToggleMute }: ChatModerationMenuProps) {
  return (
    <div className={s.menu}>
      <blockquote className={s.quote}>{text}</blockquote>
      {canDelete && <Pill variant="danger" block icon={Trash2} onClick={onDelete}>Eliminar mensaje</Pill>}
      {canMute && (
        <Pill variant="cream" block icon={muted ? MessageSquare : MessageSquareOff} onClick={onToggleMute}>
          {muted ? `Quitar el silencio a ${authorName}` : `Silenciar a ${authorName} en el chat`}
        </Pill>
      )}
    </div>
  );
}

function clock(sentAt: number): string {
  const date = new Date(sentAt);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  messages: ChatMessage[];
  members: RoomMemberView[];
  selfId: string;
  selfRole: RoomRole;
  onSend(text: string): Promise<void>;
  onDelete(seq: number): Promise<void>;
  onSetMute(playerId: string, muted: boolean): Promise<void>;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  className?: string;
}

/**
 * Chat del lobby: la lista y el campo de escribir en el panel «Chat». No es región viva (el `Lobby` anuncia los
 * mensajes) y no enseña errores: el fallo de una orden ya sale en el aviso global de la sala.
 */
export function LobbyChat({ messages, members, selfId, selfRole, onSend, onDelete, onSetMute, titleRef, className }: Props) {
  const ownTitleRef = useRef<HTMLHeadingElement>(null);
  const title = titleRef ?? ownTitleRef;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [moderating, setModerating] = useState<number | null>(null);
  // El fallo de una orden ya sale, traducido, en el aviso global de la sala (RoomContext): aquí solo se captura.
  const ignoreFailure = () => undefined;
  const self = members.find((member) => member.id === selfId);
  const muted = Boolean(self?.chatMuted) && selfRole !== 'HOST';
  const canModerate = hasRoomPermission(selfRole, 'MODERATE_CHAT');
  const memberIndex = new Map(members.map((member, index) => [member.id, index]));
  const actions = (message: ChatMessage) => {
    const author = members.find((member) => member.id === message.authorId);
    return { author, canDelete: canDeleteChatMessage(selfRole, author?.roomRole ?? null), canMute: canMuteInChat(selfId, selfRole, author) };
  };

  const items: ChatLogItem[] = messages.map((message) => {
    const index = memberIndex.get(message.authorId);
    const { canDelete, canMute } = actions(message);
    return {
      id: String(message.seq), author: message.authorName, time: clock(message.sentAt), text: message.text,
      own: message.authorId === selfId, moderatable: canDelete || canMute,
      // El color es el de su orden en la sala, como en «Jugadores»; si ya salió, en neutro.
      ...(index !== undefined ? { authorTone: playerColor(index) } : {}),
    };
  });

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSend(draft); setDraft(''); } catch { ignoreFailure(); }
    finally { setBusy(false); }
  };
  const target = moderating === null ? undefined : messages.find((message) => message.seq === moderating);
  const close = () => setModerating(null);
  const remove = (seq: number) => {
    close();
    void onDelete(seq).catch(ignoreFailure);
    // El diálogo devolvería el foco a un botón que va a desaparecer: una tarea después, al título del panel.
    window.setTimeout(() => title.current?.focus(), 0);
  };

  const empty = <StateBox kind="empty" live={false} title="Todavía no hay mensajes." text="Hablando es mejor: si podéis, usad también una llamada de voz (Discord, Zoom…)" />;
  const targetActions = target ? actions(target) : null;
  return (
    <Panel title="Chat" titleRef={title} aria-label="Chat" className={className ?? ''} bodyClassName={s.body ?? ''}>
      <ChatLog items={items} label="Mensajes del chat" empty={empty} className={s.log ?? ''}
        {...(canModerate ? { onModerate: (id: string) => setModerating(Number(id)), moderateLabel: (item: ChatLogItem) => `Moderar el mensaje de ${item.author}` } : {})} />
      <ChatComposer value={draft} onChange={setDraft} onSubmit={() => void send()} label="Escribe un mensaje" maxLength={MAX_LENGTH} busy={busy} disabledReason={muted ? MUTED_REASON : null} />
      {canModerate && (
        <Dialog open={Boolean(target)} title={target ? `Mensaje de ${target.authorName}` : 'Mensaje'} onClose={close} width={420}
          actions={[{ label: 'Cancelar', variant: 'blue', autoFocus: true, onClick: () => undefined }]}>
          {target && targetActions && (
            <ChatModerationMenu text={target.text} authorName={target.authorName} canDelete={targetActions.canDelete} canMute={targetActions.canMute}
              muted={Boolean(targetActions.author?.chatMuted)} onDelete={() => remove(target.seq)}
              onToggleMute={() => { close(); void onSetMute(target.authorId, !targetActions.author?.chatMuted).catch(ignoreFailure); }} />
          )}
        </Dialog>
      )}
    </Panel>
  );
}
