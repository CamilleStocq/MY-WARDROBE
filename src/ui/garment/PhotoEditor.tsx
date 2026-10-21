import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { decode, draw, toBlob } from '../../services/imageService';
import { BG_MODEL_SIZE_LABEL, BackgroundRemovalError, computeForegroundMask, maskBounds, type RemovalProgress } from '../../services/backgroundRemoval';
import { Button, Chip, IconButton, Notice, Sheet } from '../primitives';
import { Icon } from '../Icon';

/**
 * Retouche d'une photo de vêtement : détourage automatique (sur l'appareil),
 * gomme / pinceau de restauration, recadrage, rotation, annulation.
 * L'image est représentée par une base RGB + un masque alpha modifiable.
 */
type Tool = 'none' | 'erase' | 'restore' | 'crop';
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WORK_MAX = 1200;

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const MAX_HISTORY = 12;

export function PhotoEditor({
  source,
  onDone,
  onCancel,
  onSkip,
}: {
  source: Blob;
  /** peut être asynchrone : « Valider » reste en chargement jusqu'à la fin */
  onDone: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
  onSkip?: () => void | Promise<void>;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const historyRef = useRef<(Uint8ClampedArray | null)[]>([]);
  const paintRef = useRef<{ last: [number, number] } | null>(null);
  const cropStartRef = useRef<[number, number] | null>(null);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  /** incrémenté quand l'image de base change (chargement, rotation, recadrage) */
  const [rev, setRev] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('none');
  const [brush, setBrush] = useState(22);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [compare, setCompare] = useState(false);
  const [removing, setRemoving] = useState<RemovalProgress | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [historyLen, setHistoryLen] = useState(0);
  const [hasMask, setHasMask] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ---------- chargement ----------
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const src = await decode(source);
      const { canvas, ctx } = draw(src, WORK_MAX, null);
      if ('close' in src) src.close();
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // image déjà détourée (ex. iOS « Copier le sujet ») : sa transparence devient le masque
      let mask: Uint8ClampedArray | null = null;
      for (let i = 3; i < data.data.length; i += 4 * 97) {
        if (data.data[i] < 250) {
          mask = new Uint8ClampedArray(canvas.width * canvas.height);
          for (let p = 0; p < mask.length; p++) mask[p] = data.data[p * 4 + 3];
          break;
        }
      }
      for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255;
      baseRef.current = data;
      maskRef.current = mask;
      historyRef.current = [];
      setHistoryLen(0);
      setHasMask(!!mask);
      setCrop(null);
      setSize({ w: canvas.width, h: canvas.height });
      setRev((r) => r + 1);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Cette image n’a pas pu être ouverte.');
    }
  }, [source]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- rendu ----------
  // `composite` = base + masque alpha, tenu à jour par zone pendant le tracé (rendu direct, sans attente).
  const compositeRef = useRef<ImageData | null>(null);

  const rebuildComposite = useCallback(() => {
    const base = baseRef.current;
    if (!base) return;
    const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    const mask = maskRef.current;
    if (mask) for (let p = 0; p < mask.length; p++) out.data[p * 4 + 3] = mask[p];
    compositeRef.current = out;
  }, []);

  const render = useCallback(
    (dirty?: Rect) => {
      const canvas = viewRef.current;
      const base = baseRef.current;
      if (!canvas || !base) return;
      if (!compositeRef.current || compositeRef.current.width !== base.width || compositeRef.current.height !== base.height) rebuildComposite();
      if (canvas.width !== base.width || canvas.height !== base.height) {
        canvas.width = base.width;
        canvas.height = base.height;
      }
      const ctx = canvas.getContext('2d')!;
      const img = compare || !maskRef.current ? base : compositeRef.current!;
      if (dirty && !crop) ctx.putImageData(img, 0, 0, dirty.x, dirty.y, dirty.w, dirty.h);
      else ctx.putImageData(img, 0, 0);
      if (crop) {
        ctx.save();
        ctx.fillStyle = 'rgba(43, 42, 46, 0.5)';
        ctx.beginPath();
        ctx.rect(0, 0, base.width, base.height);
        ctx.rect(crop.x, crop.y, crop.w, crop.h);
        ctx.fill('evenodd');
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, base.width / 300);
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
        ctx.restore();
      }
    },
    [compare, crop, rebuildComposite],
  );

  /** Le masque a été remplacé (chargement, détourage, annulation, rotation, recadrage). */
  const maskChanged = useCallback(() => {
    rebuildComposite();
    render();
  }, [rebuildComposite, render]);

  useEffect(() => {
    if (size) maskChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);
  useEffect(() => {
    if (size) render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, crop]);

  // ---------- historique ----------
  function pushHistory() {
    const m = maskRef.current;
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), m ? new Uint8ClampedArray(m) : null];
    setHistoryLen(historyRef.current.length);
  }
  function undo() {
    const prev = historyRef.current.pop();
    if (prev === undefined) return;
    maskRef.current = prev;
    setHistoryLen(historyRef.current.length);
    setHasMask(!!prev);
    maskChanged();
  }

  // ---------- gomme / pinceau ----------
  function toImage(e: RPointerEvent<HTMLCanvasElement>): [number, number] {
    const c = viewRef.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  }
  function brushRadius() {
    const c = viewRef.current!;
    return (brush * c.width) / c.getBoundingClientRect().width;
  }
  function dab(cx: number, cy: number, r: number, value: number) {
    const base = baseRef.current!;
    if (!maskRef.current) maskRef.current = new Uint8ClampedArray(base.width * base.height).fill(255);
    const m = maskRef.current;
    if (!compositeRef.current) rebuildComposite();
    const comp = compositeRef.current;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(base.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(base.height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) {
          m[y * base.width + x] = value;
          if (comp) comp.data[(y * base.width + x) * 4 + 3] = value;
        }
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function strokeTo(pt: [number, number]) {
    const st = paintRef.current;
    if (!st) return;
    const r = brushRadius();
    const value = tool === 'erase' ? 0 : 255;
    const [lx, ly] = st.last;
    const dist = Math.hypot(pt[0] - lx, pt[1] - ly);
    const steps = Math.max(1, Math.ceil(dist / (r / 2)));
    let box: Rect | null = null;
    for (let i = 1; i <= steps; i++) {
      const b = dab(lx + ((pt[0] - lx) * i) / steps, ly + ((pt[1] - ly) * i) / steps, r, value);
      box = box ? union(box, b) : b;
    }
    st.last = pt;
    setHasMask(true);
    render(box ?? undefined);
  }

  function onPointerDown(e: RPointerEvent<HTMLCanvasElement>) {
    if (tool === 'none' || removing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toImage(e);
    if (tool === 'crop') {
      cropStartRef.current = pt;
      setCrop({ x: pt[0], y: pt[1], w: 0, h: 0 });
      return;
    }
    pushHistory();
    paintRef.current = { last: pt };
    const box = dab(pt[0], pt[1], brushRadius(), tool === 'erase' ? 0 : 255);
    setHasMask(true);
    render(box);
  }
  function onPointerMove(e: RPointerEvent<HTMLCanvasElement>) {
    if (tool === 'crop' && cropStartRef.current) {
      const [sx, sy] = cropStartRef.current;
      const [x, y] = toImage(e);
      const base = baseRef.current!;
      const cx = Math.max(0, Math.min(base.width, x));
      const cy = Math.max(0, Math.min(base.height, y));
      setCrop({ x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) });
      return;
    }
    if (paintRef.current) strokeTo(toImage(e));
  }
  function onPointerUp() {
    paintRef.current = null;
    cropStartRef.current = null;
  }

  // ---------- transformations ----------
  function applyCrop(rect: Rect) {
    const base = baseRef.current!;
    const x = Math.round(rect.x), y = Math.round(rect.y);
    const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h));
    const out = new ImageData(w, h);
    const mask = maskRef.current;
    const outMask = mask ? new Uint8ClampedArray(w * h) : null;
    for (let row = 0; row < h; row++) {
      const srcStart = ((y + row) * base.width + x) * 4;
      out.data.set(base.data.subarray(srcStart, srcStart + w * 4), row * w * 4);
      if (mask && outMask) outMask.set(mask.subarray((y + row) * base.width + x, (y + row) * base.width + x + w), row * w);
    }
    baseRef.current = out;
    maskRef.current = outMask;
    historyRef.current = [];
    setHistoryLen(0);
    setCrop(null);
    setTool('none');
    setSize({ w, h });
    setRev((r) => r + 1);
  }

  function rotate() {
    const base = baseRef.current!;
    const { width: w, height: h } = base;
    const out = new ImageData(h, w);
    const mask = maskRef.current;
    const outMask = mask ? new Uint8ClampedArray(w * h) : null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = h - 1 - y, ny = x; // rotation de 90° dans le sens horaire
        const si = (y * w + x) * 4, di = (ny * h + nx) * 4;
        out.data[di] = base.data[si];
        out.data[di + 1] = base.data[si + 1];
        out.data[di + 2] = base.data[si + 2];
        out.data[di + 3] = 255;
        if (mask && outMask) outMask[ny * h + nx] = mask[y * w + x];
      }
    }
    baseRef.current = out;
    maskRef.current = outMask;
    historyRef.current = [];
    setHistoryLen(0);
    setCrop(null);
    setSize({ w: h, h: w });
    setRev((r) => r + 1);
  }

  async function removeBackground() {
    const base = baseRef.current!;
    setRemoveError(null);
    setTool('none');
    setRemoving({ phase: 'download', ratio: null });
    try {
      const c = document.createElement('canvas');
      c.width = base.width;
      c.height = base.height;
      c.getContext('2d')!.putImageData(base, 0, 0);
      const png = await toBlob(c, 'image/png');
      const mask = await computeForegroundMask(png, base.width, base.height, (p) => setRemoving(p));
      pushHistory();
      maskRef.current = mask;
      setHasMask(true);
      const b = maskBounds(mask, base.width, base.height);
      if (b && (b.w < base.width * 0.97 || b.h < base.height * 0.97)) applyCrop(b);
      else maskChanged();
      if (!b) setRemoveError('Aucun vêtement n’a été reconnu. Essayez une photo plus contrastée ou la gomme.');
    } catch (e) {
      setRemoveError(e instanceof BackgroundRemovalError ? e.message : 'Le détourage a échoué. Vous pouvez utiliser la gomme à la place.');
    } finally {
      setRemoving(null);
    }
  }

  async function finish() {
    const base = baseRef.current;
    if (!base) return;
    setExporting(true);
    try {
      const c = document.createElement('canvas');
      c.width = base.width;
      c.height = base.height;
      const mask = maskRef.current;
      const transparent = !!mask && mask.some((v) => v < 250);
      const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
      if (transparent) for (let p = 0; p < mask!.length; p++) out.data[p * 4 + 3] = mask![p];
      c.getContext('2d')!.putImageData(out, 0, 0);
      await onDone(await toBlob(c, transparent ? 'image/png' : 'image/jpeg', 0.92));
    } finally {
      setExporting(false);
    }
  }

  const busy = !!removing || exporting;
  const pct = removing?.ratio != null ? ` ${Math.round(removing.ratio * 100)} %` : '';

  return (
    <Sheet
      title="Retoucher la photo"
      onClose={onCancel}
      size="wide"
      footer={
        <>
          {onSkip && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setExporting(true);
                try {
                  await onSkip();
                } finally {
                  setExporting(false);
                }
              }}
            >
              Garder la photo telle quelle
            </Button>
          )}
          <Button variant="secondary" icon="check" onClick={finish} loading={exporting} disabled={!size || !!removing}>
            Valider
          </Button>
        </>
      }
    >
      {loadError ? (
        <Notice tone="error">{loadError}</Notice>
      ) : (
        <div className="editor">
          <div className={`editor-stage ${hasMask && !compare ? 'checker' : ''}`}>
            {!size && <span className="spinner" aria-hidden />}
            <canvas
              ref={viewRef}
              className={`editor-canvas tool-${tool}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label="Aperçu de la photo"
              role="img"
            />
            {removing && (
              <div className="editor-busy" role="status">
                <span className="spinner" aria-hidden />
                <span>{removing.phase === 'download' ? `Téléchargement du modèle (une seule fois)…${pct}` : `Détourage en cours…${pct}`}</span>
              </div>
            )}
          </div>

          <div className="editor-side">
            <Button variant="primary" icon="wand" block onClick={removeBackground} loading={!!removing} disabled={!size || exporting}>
              Retirer le fond
            </Button>
            <p className="small muted">
              Le détourage se fait sur votre appareil, la photo n’est envoyée nulle part. La première fois, le modèle d’IA (≈ {BG_MODEL_SIZE_LABEL}) est téléchargé puis gardé en cache : le Wi-Fi est conseillé.
            </p>
            {removeError && <Notice tone="warn">{removeError}</Notice>}

            <div className="chip-wrap" role="radiogroup" aria-label="Outil">
              <Chip role="radio" pressed={tool === 'erase'} onClick={() => setTool(tool === 'erase' ? 'none' : 'erase')}>
                <Icon name="eraser" size={16} /> Gomme
              </Chip>
              <Chip role="radio" pressed={tool === 'restore'} onClick={() => setTool(tool === 'restore' ? 'none' : 'restore')}>
                <Icon name="brush" size={16} /> Restaurer
              </Chip>
              <Chip
                role="radio"
                pressed={tool === 'crop'}
                onClick={() => {
                  setCrop(null);
                  setTool(tool === 'crop' ? 'none' : 'crop');
                }}
              >
                <Icon name="crop" size={16} /> Recadrer
              </Chip>
            </div>

            {(tool === 'erase' || tool === 'restore') && (
              <div className="field">
                <label htmlFor="brush-size" className="label">
                  Taille du pinceau
                </label>
                <div className="range-row">
                  <span className="dot" style={{ width: 8, height: 8, background: 'var(--ink)' }} aria-hidden />
                  <input id="brush-size" type="range" min={6} max={60} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
                  <span className="dot" style={{ width: 22, height: 22, background: 'var(--ink)' }} aria-hidden />
                </div>
                <span className="hint">{tool === 'erase' ? 'Passez le doigt sur ce qui doit disparaître.' : 'Passez le doigt pour faire réapparaître une partie effacée par erreur.'}</span>
              </div>
            )}
            {tool === 'crop' && (
              <div className="field">
                <span className="hint">Tracez un rectangle autour du vêtement.</span>
                <div className="row-gap">
                  <Button size="sm" variant="secondary" disabled={!crop || crop.w < 10 || crop.h < 10} onClick={() => crop && applyCrop(crop)}>
                    Appliquer le recadrage
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCrop(null)} disabled={!crop}>
                    Effacer le cadre
                  </Button>
                </div>
              </div>
            )}

            <div className="editor-tools">
              <IconButton icon="rotate" label="Pivoter de 90°" filled onClick={rotate} disabled={busy || !size} />
              <IconButton icon="undo" label="Annuler la dernière modification" filled onClick={undo} disabled={busy || historyLen === 0} />
              <IconButton
                icon="eye"
                label="Maintenir pour voir l’original"
                filled
                disabled={!hasMask}
                onPointerDown={() => setCompare(true)}
                onPointerUp={() => setCompare(false)}
                onPointerLeave={() => setCompare(false)}
                onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setCompare(true)}
                onKeyUp={() => setCompare(false)}
              />
              <Button size="sm" variant="ghost" onClick={load} disabled={busy}>
                Repartir de l’original
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
