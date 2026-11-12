import { Brush, Download, Eraser, PaintBucket, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_DRAWING_BYTES } from '@shared';
import { getCustomColors, loadDrawing, saveCustomColors, saveDrawing } from '@/lib/storage';
import { cx } from './ui';

/**
 * Le dessin est une liste d'opérations vectorielles rejouables :
 * c'est ce qui permet l'annulation, le rétablissement et la sauvegarde automatique.
 */
type Op =
  | { t: 's'; c: string; w: number; p: number[] } // trait (la gomme est un trait blanc)
  | { t: 'f'; c: string; x: number; y: number } // pot de peinture
  | { t: 'c' }; // tout effacer

type Tool = 'brush' | 'eraser' | 'fill';

export interface DrawingHandle {
  /** Image du dessin (data URL WebP, ou PNG si le navigateur ne sait pas encoder le WebP). */
  toDataUrl(): string;
  isEmpty(): boolean;
  strokeCount(): number;
}

interface Props {
  /** Clé de sauvegarde automatique (unique par salon, partie et étape). */
  storageKey: string;
  /** Appelé après chaque modification. */
  onChange?: () => void;
}

const PALETTE = [
  '#241a4b', '#6b6b7b', '#ffffff', '#8b4a2b',
  '#ff5d73', '#ff9a3c', '#ffcf33', '#9ae66e',
  '#2fd9a3', '#12a37a', '#45c4ff', '#3b6cff',
  '#a98bff', '#ff8fd0', '#ffd7b5', '#c81e4a',
];
const SIZES = [3, 7, 13, 22, 38];
const BACKGROUND = '#ffffff';

function drawStroke(ctx: CanvasRenderingContext2D, op: Extract<Op, { t: 's' }>): void {
  const p = op.p;
  ctx.strokeStyle = op.c;
  ctx.fillStyle = op.c;
  ctx.lineWidth = op.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length <= 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Courbes quadratiques passant par les milieux : un trait lisse même avec peu de points.
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length - 2; i += 2) {
    ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  ctx.stroke();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Remplissage par diffusion (balayage de lignes), tolérant à l'anticrénelage des traits. */
function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, hex: string): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const x0 = Math.max(0, Math.min(w - 1, Math.round(startX)));
  const y0 = Math.max(0, Math.min(h - 1, Math.round(startY)));
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const [r, g, b] = hexToRgb(hex);
  const start = (y0 * w + x0) * 4;
  const tr = d[start];
  const tg = d[start + 1];
  const tb = d[start + 2];
  if (tr === r && tg === g && tb === b) return;
  const TOLERANCE = 70;
  const visited = new Uint8Array(w * h);
  const matches = (pixel: number): boolean => {
    if (visited[pixel]) return false;
    const i = pixel * 4;
    return Math.abs(d[i] - tr) <= TOLERANCE && Math.abs(d[i + 1] - tg) <= TOLERANCE && Math.abs(d[i + 2] - tb) <= TOLERANCE;
  };
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let pixel = y * w + x;
    while (x >= 0 && matches(pixel)) {
      x--;
      pixel--;
    }
    x++;
    pixel++;
    let above = false;
    let below = false;
    while (x < w && matches(pixel)) {
      visited[pixel] = 1;
      const i = pixel * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      if (y > 0) {
        const m = matches(pixel - w);
        if (m && !above) stack.push(x, y - 1);
        above = m;
      }
      if (y < h - 1) {
        const m = matches(pixel + w);
        if (m && !below) stack.push(x, y + 1);
        below = m;
      }
      x++;
      pixel++;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function render(ctx: CanvasRenderingContext2D, ops: Op[]): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // Inutile de rejouer ce qui précède le dernier « tout effacer ».
  let from = 0;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].t === 'c') {
      from = i + 1;
      break;
    }
  }
  for (let i = from; i < ops.length; i++) {
    const op = ops[i];
    if (op.t === 's') drawStroke(ctx, op);
    else if (op.t === 'f') floodFill(ctx, op.x, op.y, op.c);
  }
}

export const DrawingCanvas = forwardRef<DrawingHandle, Props>(function DrawingCanvas({ storageKey, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ops = useRef<Op[]>([]);
  const undone = useRef<Op[]>([]);
  const current = useRef<Extract<Op, { t: 's' }> | null>(null);
  const activePointer = useRef<number | null>(null);
  const pendingColor = useRef<number | undefined>(undefined);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [customColors, setCustomColors] = useState<string[]>(getCustomColors);
  /** Compteur incrémenté à chaque changement, pour rafraîchir l'état des boutons. */
  const [, setVersion] = useState(0);

  const context = () => canvasRef.current!.getContext('2d', { willReadFrequently: true })!;

  const changed = useCallback(() => {
    saveDrawing(storageKey, ops.current);
    setVersion((v) => v + 1);
    onChange?.();
  }, [storageKey, onChange]);

  // Au montage : on restaure le dessin sauvegardé (rechargement de page, reconnexion, « modifier »).
  useEffect(() => {
    const saved = loadDrawing<Op[]>(storageKey);
    ops.current = Array.isArray(saved) ? saved : [];
    undone.current = [];
    render(context(), ops.current);
    setVersion((v) => v + 1);
    if (ops.current.length) onChange?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useImperativeHandle(ref, () => ({
    toDataUrl() {
      const canvas = canvasRef.current!;
      const limit = MAX_DRAWING_BYTES * 1.3;
      let url = canvas.toDataURL('image/webp', 0.9);
      if (!url.startsWith('data:image/webp') || url.length > limit) url = canvas.toDataURL('image/png');
      if (url.length > limit) url = canvas.toDataURL('image/jpeg', 0.85);
      return url;
    },
    isEmpty: () => !ops.current.some((op, i) => op.t !== 'c' && !ops.current.slice(i + 1).some((later) => later.t === 'c')),
    strokeCount: () => ops.current.filter((op) => op.t !== 'c').length,
  }));

  const commit = (op: Op) => {
    ops.current.push(op);
    undone.current = [];
    changed();
  };

  const undo = useCallback(() => {
    const op = ops.current.pop();
    if (!op) return;
    undone.current.push(op);
    render(context(), ops.current);
    changed();
  }, [changed]);

  const redo = useCallback(() => {
    const op = undone.current.pop();
    if (!op) return;
    ops.current.push(op);
    render(context(), ops.current);
    changed();
  }, [changed]);

  const clear = () => {
    if (!ops.current.length || ops.current[ops.current.length - 1].t === 'c') return;
    ops.current.push({ t: 'c' });
    undone.current = [];
    render(context(), ops.current);
    changed();
  };

  const download = () => {
    canvasRef.current!.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'griboulade-dessin.png';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }, 'image/png');
  };

  // Raccourcis clavier : Ctrl/⌘+Z, Ctrl/⌘+Maj+Z ou Ctrl+Y, B / E / F pour les outils.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        redo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === 'b') setTool('brush');
        else if (key === 'e') setTool('eraser');
        else if (key === 'f') setTool('fill');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ───────────── Pointeur (souris, doigt, stylet) ─────────────

  const toCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH * 10) / 10,
      Math.round(((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT * 10) / 10,
    ];
  };

  const moveCursor = (e: ReactPointerEvent) => {
    const el = cursorRef.current;
    if (!el) return;
    if (e.pointerType !== 'mouse' || tool === 'fill') {
      el.style.opacity = '0';
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const diameter = Math.max(4, (size * rect.width) / CANVAS_WIDTH);
    el.style.opacity = '1';
    el.style.width = `${diameter}px`;
    el.style.height = `${diameter}px`;
    el.style.transform = `translate(${e.clientX - rect.left - diameter / 2}px, ${e.clientY - rect.top - diameter / 2}px)`;
  };

  const extend = (x: number, y: number) => {
    const stroke = current.current;
    if (!stroke) return;
    const p = stroke.p;
    const n = p.length;
    if (Math.hypot(x - p[n - 2], y - p[n - 1]) < 1.2) return;
    p.push(x, y);
    const ctx = context();
    ctx.strokeStyle = stroke.c;
    ctx.lineWidth = stroke.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (p.length === 4) {
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo((p[0] + p[2]) / 2, (p[1] + p[3]) / 2);
    } else {
      const m = p.length;
      ctx.moveTo((p[m - 6] + p[m - 4]) / 2, (p[m - 5] + p[m - 3]) / 2);
      ctx.quadraticCurveTo(p[m - 4], p[m - 3], (p[m - 4] + p[m - 2]) / 2, (p[m - 3] + p[m - 1]) / 2);
    }
    ctx.stroke();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const [x, y] = toCanvas(e);
    if (tool === 'fill') {
      floodFill(context(), x, y, color);
      commit({ t: 'f', c: color, x: Math.round(x), y: Math.round(y) });
      return;
    }
    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Extract<Op, { t: 's' }> = { t: 's', c: tool === 'eraser' ? BACKGROUND : color, w: size, p: [x, y] };
    current.current = stroke;
    drawStroke(context(), stroke); // le point de départ est visible tout de suite
    moveCursor(e);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    moveCursor(e);
    if (e.pointerId !== activePointer.current) return;
    e.preventDefault();
    // Les événements « fusionnés » donnent un tracé plus fidèle quand la main va vite.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    if (events.length) for (const ev of events) extend(...toCanvas(ev));
    else extend(...toCanvas(e));
  };

  const finish = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointer.current) return;
    activePointer.current = null;
    const stroke = current.current;
    current.current = null;
    if (!stroke) return;
    const p = stroke.p;
    if (p.length > 2) {
      const ctx = context();
      ctx.strokeStyle = stroke.c;
      ctx.lineWidth = stroke.w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo((p[p.length - 4] + p[p.length - 2]) / 2, (p[p.length - 3] + p[p.length - 1]) / 2);
      ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      ctx.stroke();
    }
    commit(stroke);
  };

  // ───────────── Palette personnalisable ─────────────

  const addCustomColor = (hex: string) => {
    const value = hex.toLowerCase();
    setColor(value);
    setTool((t) => (t === 'eraser' ? 'brush' : t));
    if (PALETTE.includes(value)) return;
    setCustomColors((prev) => {
      const next = [value, ...prev.filter((c) => c !== value)].slice(0, 10);
      saveCustomColors(next);
      return next;
    });
  };

  const removeCustomColor = (hex: string) => {
    setCustomColors((prev) => {
      const next = prev.filter((c) => c !== hex);
      saveCustomColors(next);
      return next;
    });
    if (color === hex) setColor(PALETTE[0]);
  };

  const pickColor = (hex: string) => {
    setColor(hex);
    if (tool === 'eraser') setTool('brush');
  };

  const canUndo = ops.current.length > 0;
  const canRedo = undone.current.length > 0;

  const toolButton = (id: Tool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={tool === id}
      onClick={() => setTool(id)}
      className={cx(
        'flex size-10 items-center justify-center rounded-xl border-[3px] border-ink transition-all duration-150 sm:size-11',
        tool === id ? 'bg-sun shadow-pop-sm -translate-y-0.5' : 'bg-white hover:-translate-y-0.5 hover:bg-paper',
      )}
    >
      {icon}
    </button>
  );

  const actionButton = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false, danger = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex size-10 items-center justify-center rounded-xl border-[3px] border-ink bg-white transition-all duration-150 sm:size-11',
        'hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-35 disabled:hover:translate-y-0',
        danger ? 'hover:bg-coral hover:text-white' : 'hover:bg-paper',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="order-1 flex items-center gap-1.5">
          {toolButton('brush', 'Pinceau (B)', <Brush className="size-5" />)}
          {toolButton('eraser', 'Gomme (E)', <Eraser className="size-5" />)}
          {toolButton('fill', 'Pot de peinture (F)', <PaintBucket className="size-5" />)}
        </div>
        <div className="order-3 flex w-full items-center justify-center gap-1 sm:order-2 sm:w-auto" role="radiogroup" aria-label="Taille du pinceau">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={size === s}
              aria-label={`Taille ${s}`}
              title={`Taille ${s}`}
              onClick={() => setSize(s)}
              className={cx(
                'flex size-10 items-center justify-center rounded-full border-2 transition-all duration-150',
                size === s ? 'border-ink bg-sun shadow-pop-sm' : 'border-transparent hover:border-ink hover:bg-white',
              )}
            >
              <span className="rounded-full bg-ink" style={{ width: Math.min(26, s * 0.7 + 3), height: Math.min(26, s * 0.7 + 3) }} />
            </button>
          ))}
        </div>
        <div className="order-2 flex items-center gap-1.5 sm:order-3">
          {actionButton('Annuler (Ctrl+Z)', <Undo2 className="size-5" />, undo, !canUndo)}
          {actionButton('Rétablir (Ctrl+Y)', <Redo2 className="size-5" />, redo, !canRedo)}
          {actionButton('Tout effacer', <Trash2 className="size-5" />, clear, !canUndo, true)}
          {actionButton('Télécharger le dessin', <Download className="size-5" />, download)}
        </div>
      </div>

      {/* Toile */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-3xl border-[3px] border-ink bg-white shadow-pop"
        style={{ maxWidth: `min(100%, calc(58dvh * ${CANVAS_WIDTH} / ${CANVAS_HEIGHT}))`, aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="Toile de dessin"
          className={cx('block size-full touch-none select-none', tool === 'fill' ? 'cursor-cell' : 'cursor-crosshair')}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={() => {
            if (cursorRef.current) cursorRef.current.style.opacity = '0';
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-ink/70 opacity-0"
          style={{ backgroundColor: tool === 'eraser' ? 'rgb(255 255 255 / 0.8)' : `${color}55` }}
        />
      </div>

      {/* Palette */}
      <div className="flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Couleurs">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c && tool !== 'eraser'}
            aria-label={`Couleur ${c}`}
            onClick={() => pickColor(c)}
            className={cx(
              'size-9 rounded-full border-[3px] border-ink transition-transform duration-150 hover:scale-110',
              color === c && tool !== 'eraser' && 'scale-115 shadow-pop-sm ring-4 ring-ink/15',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <span className="mx-1 h-7 w-0.5 rounded bg-ink/20" aria-hidden />
        {customColors.map((c) => (
          <span key={c} className="group relative">
            <button
              type="button"
              role="radio"
              aria-checked={color === c && tool !== 'eraser'}
              aria-label={`Couleur personnalisée ${c}`}
              onClick={() => pickColor(c)}
              className={cx(
                'block size-9 rounded-full border-[3px] border-ink transition-transform duration-150 hover:scale-110',
                color === c && tool !== 'eraser' && 'scale-115 shadow-pop-sm ring-4 ring-ink/15',
              )}
              style={{ backgroundColor: c }}
            />
            <button
              type="button"
              aria-label={`Retirer la couleur ${c} de la palette`}
              title="Retirer de ma palette"
              onClick={() => removeCustomColor(c)}
              className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border-2 border-ink bg-white group-hover:flex group-focus-within:flex"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <label
          title="Ajouter une couleur à ma palette"
          className="relative flex size-9 items-center justify-center rounded-full border-[3px] border-dashed border-ink bg-white transition-transform duration-150 hover:scale-110 hover:rotate-90"
          style={{ backgroundImage: 'conic-gradient(#ff5d73, #ffcf33, #2fd9a3, #45c4ff, #a98bff, #ff5d73)' }}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-white">
            <Plus className="size-4" />
          </span>
          <input
            type="color"
            aria-label="Ajouter une couleur à ma palette"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(e) => {
              // Le sélecteur émet en continu pendant qu'on fait glisser : la couleur s'applique
              // tout de suite, mais n'entre dans la palette qu'une fois le choix stabilisé.
              const value = e.target.value.toLowerCase();
              setColor(value);
              setTool((t) => (t === 'eraser' ? 'brush' : t));
              window.clearTimeout(pendingColor.current);
              pendingColor.current = window.setTimeout(() => addCustomColor(value), 500);
            }}
          />
        </label>
      </div>
    </div>
  );
});
