import type { FeedbackItem, FeedbackType, MiniGameManifest } from '@pokemon-universe/shared';
import { ArrowLeft, Bug, CheckCircle2, Lightbulb, LoaderCircle, MessageSquarePlus, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

interface GameOption extends MiniGameManifest { defaultConfig: unknown }

export function FeedbackPage() {
  const [params] = useSearchParams();
  const requestedGameId = params.get('game') ?? '';
  const roomCode = params.get('room')?.toUpperCase();
  const validRoomCode = roomCode && /^[A-Z2-9]{6}$/.test(roomCode) ? roomCode : undefined;
  const [games, setGames] = useState<GameOption[]>([]);
  const [gameId, setGameId] = useState(requestedGameId);
  const [type, setType] = useState<FeedbackType>('BUG');
  const [description, setDescription] = useState('');
  const [loadingGames, setLoadingGames] = useState(true);
  const [gameError, setGameError] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<FeedbackItem | null>(null);

  const loadGames = useCallback(() => {
    let active = true;
    setLoadingGames(true); setGameError('');
    void api<{ games: GameOption[] }>('/games')
      .then((response) => { if (active) setGames(response.games); })
      .catch((caught: Error) => { if (active) setGameError(caught.message); })
      .finally(() => { if (active) setLoadingGames(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => loadGames(), [loadGames]);

  const selectedGame = useMemo(() => games.find((game) => game.id === gameId), [gameId, games]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try {
      const response = await api<{ feedback: FeedbackItem }>('/feedback', {
        method: 'POST',
        body: JSON.stringify({ gameId, type, description, ...(validRoomCode ? { roomCode: validRoomCode } : {}) }),
      });
      setSent(response.feedback);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo enviar el feedback.'); }
    finally { setSending(false); }
  }

  if (sent) return <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-5 sm:py-16">
    <div className="panel p-6 text-center sm:p-9">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-leaf/10 text-leaf"><CheckCircle2 size={30} /></span>
      <h1 className="mt-5 font-display text-3xl font-bold">Gracias por avisar</h1>
      <p className="mx-auto mt-2 max-w-lg font-semibold leading-relaxed text-ink/65">Tu {sent.type === 'BUG' ? 'reporte' : 'sugerencia'} sobre <strong className="text-ink">{sent.gameName}</strong> ya está en la bandeja de administración.</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        {validRoomCode && <Link className="btn-primary" to="/room">Volver a la partida</Link>}
        <button className="btn-ghost" type="button" onClick={() => { setDescription(''); setSent(null); }}>Enviar otro comentario</button>
        {!validRoomCode && <Link className="btn-primary" to="/">Volver al inicio</Link>}
      </div>
    </div>
  </section>;

  return <section className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-5 sm:py-12">
    <Link className="mb-5 inline-flex min-h-11 items-center gap-2 font-extrabold text-ink/65 underline decoration-ink/25 underline-offset-4 hover:text-ink" to={validRoomCode ? '/room' : '/'}><ArrowLeft size={18} />{validRoomCode ? 'Volver a la partida' : 'Volver al inicio'}</Link>
    <div className="panel overflow-hidden">
      <header className="border-b border-ink/10 p-5 sm:p-7">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-aqua/10 text-aqua"><MessageSquarePlus size={25} /></span><div><h1 className="font-display text-3xl font-bold sm:text-4xl">Enviar feedback</h1><p className="mt-2 max-w-[65ch] font-semibold leading-relaxed text-ink/65">Cuéntame qué ha fallado o qué mejorarías. El mensaje llegará directamente al panel de administración.</p></div></div>
      </header>
      <form className="space-y-6 p-5 sm:p-7" onSubmit={(event) => void submit(event)}>
        <div><label><span className="label">Minijuego</span><select className="field" value={gameId} onChange={(event) => setGameId(event.target.value)} disabled={loadingGames} required><option value="">{loadingGames ? 'Cargando minijuegos…' : 'Selecciona un minijuego'}</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>{gameError && <div className="status-error mt-3 flex flex-wrap items-center justify-between gap-3" role="alert"><span>{gameError}</span><button className="btn-ghost text-sm" type="button" onClick={loadGames}>Volver a intentar</button></div>}</div>

        <fieldset><legend className="label">Tipo de feedback</legend><div className="grid gap-3 sm:grid-cols-2">
          <button type="button" aria-pressed={type === 'BUG'} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${type === 'BUG' ? 'border-berry bg-berry/10' : 'border-ink/10 bg-surface-raised hover:border-ink/25'}`} onClick={() => setType('BUG')}><Bug className={type === 'BUG' ? 'text-berry' : 'text-ink/50'} size={23} /><span><strong className="block font-display text-lg">Reportar problema</strong><span className="block text-sm font-semibold text-ink/60">Algo no funciona como debería.</span></span></button>
          <button type="button" aria-pressed={type === 'SUGGESTION'} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${type === 'SUGGESTION' ? 'border-electric bg-electric/10' : 'border-ink/10 bg-surface-raised hover:border-ink/25'}`} onClick={() => setType('SUGGESTION')}><Lightbulb className={type === 'SUGGESTION' ? 'text-electric' : 'text-ink/50'} size={23} /><span><strong className="block font-display text-lg">Enviar sugerencia</strong><span className="block text-sm font-semibold text-ink/60">Una idea para mejorar el juego.</span></span></button>
        </div></fieldset>

        <label><span className="mb-1.5 flex items-center justify-between gap-3"><span className="label !mb-0">Descripción</span><span className="text-xs font-extrabold tabular-nums text-ink/50">{description.length}/2000</span></span><textarea className="field min-h-40 resize-y" value={description} onChange={(event) => setDescription(event.target.value.slice(0, 2_000))} minLength={10} maxLength={2_000} placeholder={type === 'BUG' ? 'Explica qué ocurrió y qué estabas haciendo…' : 'Describe tu idea y cómo mejoraría la partida…'} required /></label>

        {(selectedGame || validRoomCode) && <div className="flex flex-wrap gap-2 text-xs font-extrabold text-ink/60" aria-label="Contexto incluido">{selectedGame && <span className="permission-chip">Juego: {selectedGame.name}</span>}{validRoomCode && <span className="permission-chip">Sala: {validRoomCode}</span>}</div>}
        {error && <p className="status-error" role="alert">{error}</p>}
        <div className="flex justify-end"><button className="btn-primary w-full sm:w-auto" disabled={sending || loadingGames || !gameId || description.trim().length < 10} aria-busy={sending}>{sending ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}{sending ? 'Enviando…' : 'Enviar feedback'}</button></div>
      </form>
    </div>
  </section>;
}
