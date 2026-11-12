import { Check, Eye, Lightbulb, Pencil, Send, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_TEXT_LENGTH, getTheme, randomPhrase, type RoomState, type TaskView } from '@shared';
import { DrawingFrame } from '@/components/BookView';
import { DrawingCanvas, type DrawingHandle } from '@/components/DrawingCanvas';
import { Timer, useOnExpire } from '@/components/Timer';
import { Avatar, Button, Card, Pill, cx } from '@/components/ui';
import { editStep, sendDraft, submitStep, succeeded, toast } from '@/lib/game';

const STEP_LABEL = { write: 'Écriture', draw: 'Dessin', guess: 'Devinette' } as const;
const STEP_EMOJI = { write: '✍️', draw: '🎨', guess: '🤔' } as const;

/** Bandeau commun : étape en cours, chrono, avancement des joueurs. */
function StepHeader({ room }: { room: RoomState }) {
  const players = room.players.filter((p) => !p.spectator);
  const done = players.filter((p) => p.done).length;
  const kind = room.phase as keyof typeof STEP_LABEL;
  return (
    <div className="sticky top-2 z-20 mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-full border-[3px] border-ink bg-paper/95 px-2 py-1.5 shadow-pop-sm backdrop-blur">
      <div className="flex items-center gap-3">
        <Pill color={kind === 'write' ? 'sun' : kind === 'draw' ? 'sky' : 'bubble'} className="!text-base">
          {STEP_EMOJI[kind]} {STEP_LABEL[kind]}
        </Pill>
        <div className="flex items-center gap-1" aria-label={`Étape ${room.round + 1} sur ${room.totalRounds + 1}`}>
          {Array.from({ length: room.totalRounds + 1 }, (_, i) => (
            <span
              key={i}
              className={cx(
                'h-3 rounded-full border-2 border-ink transition-all duration-300',
                i < room.round ? 'w-3 bg-ink' : i === room.round ? 'w-7 bg-coral' : 'w-3 bg-white',
              )}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden font-display font-semibold text-ink-soft sm:inline">
          {done}/{players.length} ont fini
        </span>
        <Timer deadline={room.deadline} duration={room.phaseDuration} />
      </div>
    </div>
  );
}

/** Qui a déjà rendu sa copie ? */
function Progress({ room }: { room: RoomState }) {
  const players = room.players.filter((p) => !p.spectator);
  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {players.map((p) => (
        <li key={p.pid} className="flex w-16 flex-col items-center gap-1 text-center">
          <span className="relative">
            <Avatar avatar={p.avatar} dimmed={!p.connected} className={cx(!p.done && p.connected && 'animate-bounce-soft')} />
            <span
              className={cx(
                'absolute -right-1.5 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-ink text-xs',
                p.done ? 'bg-mint' : p.connected ? 'bg-white' : 'bg-coral text-white',
              )}
            >
              {p.done ? <Check className="size-4" strokeWidth={3} /> : p.connected ? '…' : <WifiOff className="size-3" />}
            </span>
          </span>
          <span className="w-full truncate text-xs font-bold">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

function Waiting({ room, task }: { room: RoomState; task: TaskView }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mx-auto max-w-2xl animate-pop-in text-center">
      <div className="mx-auto mb-3 flex size-20 items-center justify-center rounded-full border-[3px] border-ink bg-mint shadow-pop">
        <Check className="size-10" strokeWidth={3.5} />
      </div>
      <h2 className="text-3xl">C’est envoyé !</h2>
      {task.submittedText && <p className="mt-2 font-display text-xl text-ink-soft">« {task.submittedText} »</p>}
      <p className="mt-2 mb-6 font-bold text-ink-soft">On attend les autres artistes…</p>
      <Progress room={room} />
      <Button
        color="white"
        className="mt-6"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          succeeded(await editStep());
          setBusy(false);
        }}
      >
        <Pencil className="size-5" /> Modifier ma réponse
      </Button>
    </Card>
  );
}

function Spectating({ room }: { room: RoomState }) {
  return (
    <Card className="mx-auto max-w-2xl animate-fade-up text-center">
      <div className="mx-auto mb-3 flex size-20 animate-wiggle items-center justify-center rounded-full border-[3px] border-ink bg-lilac shadow-pop">
        <Eye className="size-10" />
      </div>
      <h2 className="text-3xl">Tu regardes la partie</h2>
      <p className="mt-2 mb-6 font-bold text-ink-soft">
        Les joueurs sont en plein travail. Tu verras tous les carnets pendant la révélation finale, et tu pourras jouer à la prochaine partie.
      </p>
      <Progress room={room} />
    </Card>
  );
}

// ───────────────────────────── Écriture & devinette ─────────────────────────────

function TextStep({ room, task }: { room: RoomState; task: TaskView }) {
  const [text, setText] = useState(task.draftText ?? '');
  const [sending, setSending] = useState(false);
  const isGuess = task.kind === 'guess';
  const theme = getTheme(room.theme);
  const latest = useRef(text);
  latest.current = text;

  // Brouillon envoyé au serveur : il servira si le chrono expire avant la validation.
  useEffect(() => {
    const id = window.setTimeout(() => sendDraft({ round: task.round, text }), 600);
    return () => window.clearTimeout(id);
  }, [text, task.round]);

  const submit = useCallback(
    async (silent = false) => {
      const value = latest.current.trim();
      if (!value) {
        if (!silent) toast(isGuess ? 'Écris ce que tu vois !' : 'Écris une phrase d’abord !', 'error');
        return;
      }
      setSending(true);
      const res = await submitStep({ round: task.round, text: value });
      setSending(false);
      if (!silent) succeeded(res);
    },
    [task.round, isGuess],
  );

  useOnExpire(room.deadline, () => void submit(true));

  return (
    <form
      className={cx('mx-auto grid max-w-5xl animate-fade-up gap-5', isGuess && 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start')}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {isGuess && (
        <div className="-rotate-1 rounded-3xl border-[3px] border-ink bg-white p-2.5 pb-3 shadow-pop-lg">
          <DrawingFrame id={task.promptDrawingId} alt="Dessin à deviner" className="border-2" />
        </div>
      )}
      <Card className={cx(!isGuess && 'mx-auto w-full max-w-2xl')}>
        <h2 className="text-3xl sm:text-4xl">{isGuess ? 'Qu’est-ce que c’est ?' : 'Invente une phrase'}</h2>
        <p className="mt-1 mb-4 font-bold text-ink-soft">
          {isGuess
            ? 'Décris ce dessin en une phrase. Le joueur suivant devra la dessiner !'
            : 'Drôle, bizarre, absurde… quelqu’un va devoir la dessiner.'}
        </p>
        {!isGuess && theme && (
          <div className="mb-3 rounded-2xl border-2 border-ink bg-lilac/40 px-4 py-2 font-semibold">
            <span className="font-display font-semibold">
              Thème : {theme.emoji} {theme.label}
            </span>{' '}
            — {theme.hint}
          </div>
        )}
        <div className="relative">
          <textarea
            className="field min-h-32 resize-none !text-xl leading-snug"
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            autoFocus
            placeholder={isGuess ? 'Je vois…' : 'Ex. Un pingouin qui passe son permis de conduire'}
            enterKeyHint="send"
            onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <span className={cx('absolute right-3 bottom-3 text-sm font-bold', text.length > MAX_TEXT_LENGTH - 15 ? 'text-coral' : 'text-ink/40')}>
            {text.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {!isGuess ? (
            <Button color="white" onClick={() => setText(randomPhrase(room.theme))}>
              <Lightbulb className="size-5" /> Inspire-moi
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" color="mint" size="lg" loading={sending} className="max-sm:w-full">
            <Send className="size-5" /> Valider
          </Button>
        </div>
      </Card>
    </form>
  );
}

// ───────────────────────────── Dessin ─────────────────────────────

function DrawStep({ room, task }: { room: RoomState; task: TaskView }) {
  const canvas = useRef<DrawingHandle>(null);
  const dirty = useRef(false);
  const [sending, setSending] = useState(false);
  const storageKey = `${room.code}.${room.gameId}.${task.round}`;
  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);

  // Enregistrement automatique côté serveur : si le chrono expire, c'est ce brouillon qui sera utilisé.
  useEffect(() => {
    const id = window.setInterval(() => {
      const c = canvas.current;
      if (!dirty.current || !c || c.isEmpty()) return;
      dirty.current = false;
      sendDraft({ round: task.round, drawing: c.toDataUrl(), strokes: c.strokeCount() });
    }, 4000);
    return () => window.clearInterval(id);
  }, [task.round]);

  const submit = useCallback(
    async (silent = false) => {
      const c = canvas.current;
      if (!c) return;
      if (c.isEmpty()) {
        if (!silent) toast('Dessine au moins un petit quelque chose !', 'error');
        return;
      }
      setSending(true);
      const res = await submitStep({ round: task.round, drawing: c.toDataUrl(), strokes: c.strokeCount() });
      setSending(false);
      if (!silent) succeeded(res);
    },
    [task.round],
  );

  useOnExpire(room.deadline, () => void submit(true));

  return (
    <div className="mx-auto max-w-4xl animate-fade-up select-none">
      <div className="mb-4 rounded-3xl border-[3px] border-ink bg-sun px-5 py-3 text-center shadow-pop">
        <div className="font-display text-sm font-semibold tracking-wide text-ink/70 uppercase">À toi de dessiner</div>
        <p className="font-display text-2xl leading-tight font-semibold break-words sm:text-3xl">« {task.promptText} »</p>
      </div>
      <Card className="!p-3 sm:!p-5">
        <DrawingCanvas ref={canvas} storageKey={storageKey} onChange={markDirty} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-bold text-ink-soft">💾 Ton dessin est enregistré automatiquement.</span>
          <Button color="mint" size="lg" loading={sending} onClick={() => void submit()} className="max-sm:w-full">
            <Send className="size-5" /> J’ai fini !
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Écran de jeu : écriture, dessin ou devinette selon l'étape. */
export function Play({ room }: { room: RoomState }) {
  const task = room.task;
  return (
    <div>
      <StepHeader room={room} />
      {!task ? (
        <Spectating room={room} />
      ) : task.submitted ? (
        <Waiting room={room} task={task} />
      ) : task.kind === 'draw' ? (
        <DrawStep key={task.round} room={room} task={task} />
      ) : (
        <TextStep key={task.round} room={room} task={task} />
      )}
    </div>
  );
}
