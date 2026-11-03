import {
  FEEDBACK_REFERENCES,
  FEEDBACK_REFERENCE_LABELS,
  FEEDBACK_TYPE_LABELS,
  type FeedbackItem,
  type FeedbackReference,
  type FeedbackType,
  type MiniGameManifest,
} from '@pokemon-universe/shared/public';
import { ArrowLeft, Bug, CheckCircle2, Lightbulb, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { feedbackErrorMessage } from '../feedback/feedbackErrors';
import { api } from '../lib/api';
import type { FeedbackCreateResponse } from '../lib/api-contract';
import { Chip, Icon, Panel, Pill, PillLink, Segmented, SelectField, StateBox, TextArea } from '../ui';

interface GameOption extends MiniGameManifest { defaultConfig: unknown }

const DESCRIPTION_ID = 'feedback-description';
const MAX_DESCRIPTION = 2_000;
const MIN_DESCRIPTION = 10;

const TYPE_OPTIONS: { value: FeedbackType; label: ReactNode }[] = [
  { value: 'BUG', label: <span className="inline-flex items-center gap-2"><Icon icon={Bug} size={18} />{FEEDBACK_TYPE_LABELS.BUG}</span> },
  { value: 'SUGGESTION', label: <span className="inline-flex items-center gap-2"><Icon icon={Lightbulb} size={18} />{FEEDBACK_TYPE_LABELS.SUGGESTION}</span> },
];

const PLACEHOLDER: Record<FeedbackType, string> = {
  BUG: 'Explica qué ocurrió, qué esperabas y cómo podemos reproducirlo…',
  SUGGESTION: 'Describe tu idea y cómo mejoraría Pokémon Universe…',
};

/** Etiqueta visible de un grupo sin `<label>` (el `Segmented` ya lleva su `aria-label`). */
function GroupLabel({ children }: { children: string }) {
  return <span className="font-display text-15 font-extrabold text-[color:var(--ink)]" aria-hidden="true">{children}</span>;
}

/**
 * Feedback en un panel crema: el tema (y el minijuego si es de uno), el tipo en `Segmented`, la descripción con
 * contador y «Enviar». Un fallo al enviar se ve en un `StateBox` en español; al acabar, el mismo panel da las gracias
 * y ofrece volver a la partida (si se llegó desde una sala) o enviar otro. En escritorio cabe sin scroll de página.
 */
export function FeedbackPage() {
  const [params] = useSearchParams();
  const requestedGameId = params.get('game') ?? '';
  const requestedReference = params.get('reference') as FeedbackReference | null;
  const initialReference: FeedbackReference = requestedGameId
    ? 'MINIGAME'
    : requestedReference && FEEDBACK_REFERENCES.includes(requestedReference) ? requestedReference : 'GENERAL';
  const roomCode = params.get('room')?.toUpperCase();
  const validRoomCode = roomCode && /^[A-Z2-9]{6}$/.test(roomCode) ? roomCode : undefined;
  const [games, setGames] = useState<GameOption[]>([]);
  const [gameId, setGameId] = useState(requestedGameId);
  const [reference, setReference] = useState<FeedbackReference>(initialReference);
  const [type, setType] = useState<FeedbackType>('BUG');
  const [description, setDescription] = useState('');
  const [loadingGames, setLoadingGames] = useState(initialReference === 'MINIGAME');
  const [gameError, setGameError] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<FeedbackItem | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const thanks = useRef<HTMLHeadingElement>(null);

  const loadGames = useCallback(() => {
    let active = true;
    setLoadingGames(true); setGameError(false);
    void api<{ games: GameOption[] }>('/games')
      .then((response) => { if (active) setGames(response.games); })
      .catch(() => { if (active) setGameError(true); })
      .finally(() => { if (active) setLoadingGames(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (reference !== 'MINIGAME') {
      setLoadingGames(false);
      setGameError(false);
      return;
    }
    return loadGames();
  }, [loadGames, reference]);

  // Foco inicial en la descripción solo con ratón: en el móvil abriría el teclado sin pedirlo.
  useEffect(() => {
    if (sent || !window.matchMedia?.('(pointer: fine)').matches) return;
    document.getElementById(DESCRIPTION_ID)?.focus();
  }, [sent]);
  useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);
  useEffect(() => { if (sent) thanks.current?.focus(); }, [sent]);

  const selectedGame = useMemo(() => games.find((game) => game.id === gameId), [gameId, games]);
  const backTo = validRoomCode ? '/room' : '/';
  const backLabel = validRoomCode ? 'Volver a la partida' : 'Volver al inicio';

  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try {
      const response = await api<FeedbackCreateResponse>('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          reference,
          type,
          description,
          ...(reference === 'MINIGAME' ? { gameId } : {}),
          ...(validRoomCode ? { roomCode: validRoomCode } : {}),
        }),
      });
      setSent(response.feedback);
    } catch (caught) { setError(feedbackErrorMessage(caught)); }
    finally { setSending(false); }
  }

  const canSend = description.trim().length >= MIN_DESCRIPTION && !(reference === 'MINIGAME' && (loadingGames || !selectedGame));

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 pb-4 pt-6 sm:px-6 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-5 lg:px-8 lg:pt-5">
      <header className="mx-auto flex w-full max-w-[76rem] flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="ol2 font-display text-34 font-extrabold text-[color:var(--white)] lg:text-44">Enviar feedback</h1>
          <p className="mt-2 text-15 font-bold text-[color:var(--sky-2)] lg:text-18">Cuéntanos qué ha fallado o qué mejorarías. Lo lee el equipo de administración.</p>
        </div>
        {!sent && <PillLink to={backTo} variant="cream" icon={ArrowLeft}>{backLabel}</PillLink>}
      </header>

      {sent ? (
        <Panel variant="cream" title="Mensaje enviado" className="mx-auto w-full max-w-[44rem] lg:self-center" bodyClassName="px-5 py-7 sm:px-8">
          <div className="flex flex-col items-center text-center" role="status">
            <span className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-[color:var(--navy)] bg-[var(--ok)] text-[color:var(--navy)]" aria-hidden="true"><Icon icon={CheckCircle2} size={32} /></span>
            <h2 ref={thanks} tabIndex={-1} className="mt-4 font-display text-34 font-extrabold text-[color:var(--ink)] outline-none">Gracias por avisar</h2>
            <p className="mt-2 max-w-[48ch] text-18 font-semibold text-[color:var(--ink-2)]">
              Tu {sent.type === 'BUG' ? 'reporte' : 'sugerencia'} sobre <strong className="text-[color:var(--ink)]">{sent.gameName ?? FEEDBACK_REFERENCE_LABELS[sent.reference]}</strong> ya está en la bandeja de administración.
            </p>
            <div className="mt-6 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <PillLink to={backTo} variant="yellow">{backLabel}</PillLink>
              <Pill variant="cream" onClick={() => { setDescription(''); setSent(null); }}>Enviar otro comentario</Pill>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel variant="cream" title="Tu mensaje" scroll className="mx-auto w-full max-w-[76rem] lg:self-start lg:max-h-full" bodyClassName="px-4 py-5 sm:px-6 lg:px-7 lg:py-4">
          <form className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8" onSubmit={(event) => void submit(event)} noValidate>
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SelectField
                  label="¿Sobre qué nos escribes?"
                  value={reference}
                  options={FEEDBACK_REFERENCES.map((value) => ({ value, label: FEEDBACK_REFERENCE_LABELS[value] }))}
                  onChange={(value) => { const next = value as FeedbackReference; setReference(next); if (next !== 'MINIGAME') setGameId(''); }}
                />
                <p className="text-13 font-semibold text-[color:var(--ink-2)]">Déjalo en «{FEEDBACK_REFERENCE_LABELS.GENERAL}» si no necesitas concretar.</p>
              </div>
              {reference === 'MINIGAME' && (gameError
                ? <StateBox kind="error" title="No se pudieron cargar los minijuegos" text="Comprueba la conexión y vuelve a intentarlo." action={{ label: 'Reintentar', onClick: () => { loadGames(); } }} onCream />
                : <SelectField
                    label="Minijuego"
                    value={gameId}
                    disabled={loadingGames}
                    options={[{ value: '', label: loadingGames ? 'Cargando minijuegos…' : 'Selecciona un minijuego' }, ...games.map((game) => ({ value: game.id, label: game.name }))]}
                    onChange={setGameId}
                  />)}
              <div className="flex flex-col gap-2">
                <GroupLabel>Tipo de feedback</GroupLabel>
                <Segmented label="Tipo de feedback" value={type} options={TYPE_OPTIONS} onChange={setType} className="w-full" />
              </div>
              <div className="flex flex-wrap items-center gap-2" aria-label="Contexto incluido" role="group">
                <Chip tone="info">Tema: {selectedGame?.name ?? FEEDBACK_REFERENCE_LABELS[reference]}</Chip>
                {validRoomCode && <Chip tone="neutral">Sala: {validRoomCode}</Chip>}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <TextArea
                id={DESCRIPTION_ID}
                label="Descripción"
                value={description}
                onChange={setDescription}
                maxLength={MAX_DESCRIPTION}
                rows={5}
                hint={`Mínimo ${MIN_DESCRIPTION} caracteres.`}
                placeholder={PLACEHOLDER[type]}
              />
              {error && (
                <div ref={errorBox} tabIndex={-1} className="rounded-[var(--r-card)] outline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[color:var(--navy)]">
                  <StateBox kind="error" title="No se pudo enviar el feedback" text={error} onCream />
                </div>
              )}
              <Pill type="submit" variant="yellow" icon={Send} loading={sending} disabled={!canSend} className="self-stretch sm:self-end">Enviar</Pill>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
