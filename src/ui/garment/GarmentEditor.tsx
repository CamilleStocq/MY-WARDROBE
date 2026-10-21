import { useEffect, useRef, useState } from 'react';
import type { Formality, Garment, GarmentCategory, Pattern, Season, Silhouette, Style, Warmth } from '../../domain/types';
import {
  ALL_SEASONS,
  ALL_STYLES,
  AVAILABILITY_LABELS,
  CATEGORY_ORDER,
  CATEGORY_SINGULAR,
  FORMALITY_LABELS,
  PATTERN_LABELS,
  SEASON_LABELS,
  SILHOUETTE_LABELS,
  STYLE_LABELS,
  WARMTH_LABELS,
  findSubcategory,
  subcategoriesOf,
} from '../../domain/taxonomy';
import { getColor } from '../../domain/colors';
import { validateGarment } from '../../domain/normalize';
import { deleteImage, getImageRecord, processImage, saveImage, type ProcessedImage } from '../../services/imageService';
import { PhotoEditor } from './PhotoEditor';
import { useStore } from '../../state/store';
import { Button, ChipGroup, ColorPicker, Field, IconButton, Notice, Segmented, Sheet } from '../primitives';
import { Icon } from '../Icon';
import { GarmentPhoto } from './GarmentImage';

type Draft = Omit<Garment, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt'>;

const EMPTY: Draft = {
  name: '',
  brand: '',
  category: 'top',
  subcategory: '',
  imageId: null,
  primaryColor: '',
  secondaryColors: [],
  pattern: 'uni',
  seasons: [],
  material: '',
  warmth: 2,
  styles: [],
  formality: 1,
  availability: 'available',
  silhouette: null,
  waterproof: false,
  notes: '',
  isDemo: false,
  favorite: false,
};

export function GarmentEditor({
  garment,
  startWithPhoto,
  onClose,
  onSaved,
}: {
  garment?: Garment;
  /** édition : ouvrir directement le remplacement de photo */
  startWithPhoto?: boolean;
  onClose: () => void;
  onSaved?: (g: Garment) => void;
}) {
  const { createGarment, saveGarment, prefs, toast } = useStore();
  const editing = !!garment;
  const [draft, setDraft] = useState<Draft>(garment ? { ...garment } : EMPTY);
  const [step, setStep] = useState<'photo' | 'retouch' | 'form'>(editing && !startWithPhoto ? 'form' : 'photo');
  /** image en cours de retouche, et écran auquel revenir si on annule */
  const [retouch, setRetouch] = useState<{ source: Blob; back: 'photo' | 'form'; skippable: boolean } | null>(null);
  const [photo, setPhoto] = useState<{ processed: ProcessedImage; preview: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Garment, string>>>({});
  const [showMore, setShowMore] = useState(editing);
  const [nameTouched, setNameTouched] = useState(editing);
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.preview);
  }, [photo]);

  const custom = prefs.customSubcategories;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as keyof Garment]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // nom proposé automatiquement tant que l'utilisateur ne l'a pas modifié
  useEffect(() => {
    if (nameTouched) return;
    const sub = findSubcategory(draft.subcategory, custom);
    const color = draft.primaryColor ? getColor(draft.primaryColor).label.toLowerCase() : '';
    const auto = [sub?.label, color].filter(Boolean).join(' ');
    setDraft((d) => (d.name === auto ? d : { ...d, name: auto }));
  }, [draft.subcategory, draft.primaryColor, nameTouched, custom]);

  /** Photo choisie : on passe par l'étape de retouche. */
  function handleFile(file: File | undefined) {
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
    if (!file) return;
    setPhotoError(null);
    if (file.type && !file.type.startsWith('image/')) {
      setPhotoError("Ce fichier n'est pas une image.");
      return;
    }
    setRetouch({ source: file, back: 'photo', skippable: true });
    setStep('retouch');
  }

  /** Retoucher la photo déjà choisie (ou celle du vêtement existant). */
  async function retouchCurrent() {
    let source: Blob | undefined = photo?.processed.full;
    if (!source && draft.imageId) source = (await getImageRecord(draft.imageId))?.full;
    if (!source) {
      setStep('photo');
      return;
    }
    setRetouch({ source, back: 'form', skippable: false });
    setStep('retouch');
  }

  /** Image finale (retouchée ou non) : compression, miniature, analyse des couleurs. */
  async function applyImage(blob: Blob) {
    setPhotoError(null);
    setProcessing(true);
    try {
      const processed = await processImage(blob);
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.preview);
        return { processed, preview: URL.createObjectURL(processed.thumb) };
      });
      const a = processed.analysis;
      if (!editing && a.primary) {
        setDraft((d) => ({
          ...d,
          primaryColor: d.primaryColor || a.primary!,
          secondaryColors: d.secondaryColors.length ? d.secondaryColors : a.secondary,
        }));
      }
      setRetouch(null);
      setStep('form');
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Cette image n'a pas pu être importée.");
      setRetouch(null);
      setStep('photo');
    } finally {
      setProcessing(false);
    }
  }

  function pickCategory(c: GarmentCategory) {
    const first = subcategoriesOf(c, custom)[0];
    setDraft((d) => ({ ...d, category: c, subcategory: d.category === c ? d.subcategory : '', warmth: d.category === c ? d.warmth : first?.warmth ?? 2 }));
  }

  function pickSub(key: string) {
    const def = findSubcategory(key, custom);
    setDraft((d) => ({
      ...d,
      subcategory: key,
      warmth: editing ? d.warmth : ((def?.warmth ?? d.warmth) as Warmth),
      waterproof: editing ? d.waterproof : key === 'impermeable' || d.waterproof,
    }));
    setErrors((e) => ({ ...e, subcategory: undefined }));
  }

  async function submit() {
    const errs = validateGarment(draft);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      let imageId = draft.imageId;
      if (photo) {
        imageId = await saveImage(photo.processed);
      }
      let saved: Garment;
      if (garment) {
        saved = await saveGarment({ ...garment, ...draft, name: draft.name.trim(), imageId });
        if (photo && garment.imageId && garment.imageId !== imageId) await deleteImage(garment.imageId);
        toast('Modifications enregistrées');
      } else {
        saved = await createGarment({ ...draft, name: draft.name.trim(), imageId });
        toast(`« ${saved.name} » ajouté à la garde-robe`);
      }
      onSaved?.(saved);
      onClose();
    } catch {
      /* l'erreur est déjà affichée par le store */
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? (step === 'photo' ? 'Remplacer la photo' : 'Modifier le vêtement') : 'Ajouter un vêtement';

  if (step === 'retouch' && retouch) {
    return (
      <PhotoEditor
        source={retouch.source}
        onDone={applyImage}
        onSkip={retouch.skippable ? () => applyImage(retouch.source) : undefined}
        onCancel={() => {
          setStep(retouch.back);
          setRetouch(null);
        }}
      />
    );
  }

  if (step === 'photo') {
    return (
      <Sheet title={title} onClose={onClose}>
        <div className="photo-pick">
          <div
            className={`photo-drop ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            {processing ? (
              <>
                <span className="spinner" aria-hidden />
                <p className="muted">Préparation de la photo…</p>
              </>
            ) : (
              <>
                <Icon name="camera" size={36} />
                <p style={{ maxWidth: '30ch' }}>
                  Posez le vêtement à plat sur un fond clair et uni. Vous pourrez retirer le fond à l’étape suivante.
                </p>
              </>
            )}
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} data-testid="gallery-input" />
          <Button variant="primary" size="lg" icon="camera" block disabled={processing} onClick={() => cameraRef.current?.click()}>
            Prendre une photo
          </Button>
          <Button variant="outline" size="lg" icon="image" block disabled={processing} onClick={() => galleryRef.current?.click()}>
            Importer depuis la galerie
          </Button>
          {photoError && <Notice tone="error">{photoError}</Notice>}
          {editing && (
            <Button variant="ghost" onClick={() => setStep('form')}>
              Garder la photo actuelle
            </Button>
          )}
          <p className="small muted" style={{ textAlign: 'center' }}>
            La photo reste sur cet appareil. Elle est redimensionnée et analysée localement, sans être envoyée à un service externe.
          </p>
        </div>
      </Sheet>
    );
  }

  const subs = subcategoriesOf(draft.category, custom);

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="secondary" loading={saving} onClick={submit}>
            {editing ? 'Enregistrer' : 'Ajouter à ma garde-robe'}
          </Button>
        </>
      }
    >
      <div className="photo-preview">
        {photo ? (
          <div className="photo">
            <img className="g-img" src={photo.preview} alt="Aperçu de la photo" />
          </div>
        ) : (
          <GarmentPhoto imageId={draft.imageId} alt="Photo actuelle" size="full" />
        )}
        <IconButton icon="camera" label={draft.imageId || photo ? 'Changer la photo' : 'Ajouter une photo'} filled onClick={() => setStep('photo')} />
        {(draft.imageId || photo) && <IconButton icon="wand" label="Retoucher la photo (retirer le fond)" filled className="retouch-btn" onClick={retouchCurrent} />}
      </div>
      {photo && !editing && (
        <p className="analysis-note">
          <Icon name="sparkle" size={16} />
          {photo.processed.analysis.primary
            ? 'Couleurs suggérées d’après la photo : vérifiez-les.'
            : 'Couleur non détectée : choisissez-la ci-dessous.'}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <Field label="Catégorie" error={errors.category}>
          <ChipGroup
            label="Catégorie"
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_SINGULAR[c] }))}
            value={[draft.category]}
            onChange={(v) => pickCategory(v[0])}
          />
        </Field>
        <Field label="Type" error={errors.subcategory}>
          <ChipGroup label="Type" options={subs.map((s) => ({ value: s.key, label: s.label }))} value={[draft.subcategory]} onChange={(v) => pickSub(v[0])} />
        </Field>
        <Field label="Couleur principale" error={errors.primaryColor} hint={draft.primaryColor ? getColor(draft.primaryColor).label : undefined}>
          <ColorPicker label="Couleur principale" value={draft.primaryColor ? [draft.primaryColor] : []} onChange={(v) => set('primaryColor', v[0])} />
        </Field>
        <Field label="Nom" htmlFor="g-name" error={errors.name} hint="Proposé automatiquement, modifiable.">
          <input
            id="g-name"
            className="input"
            value={draft.name}
            maxLength={60}
            aria-invalid={!!errors.name}
            onChange={(e) => {
              setNameTouched(true);
              set('name', e.target.value);
            }}
            onBlur={() => setErrors((er) => ({ ...er, name: validateGarment(draft).name }))}
          />
        </Field>
        <Field label="Marque (facultatif)" htmlFor="g-brand">
          <input id="g-brand" className="input" value={draft.brand} maxLength={40} autoComplete="off" onChange={(e) => set('brand', e.target.value)} />
        </Field>

        <Button variant="ghost" className="more-toggle" onClick={() => setShowMore((m) => !m)} aria-expanded={showMore}>
          <span>{showMore ? 'Moins de détails' : 'Plus de détails (facultatif)'}</span>
          <Icon name="chevronDown" size={20} />
        </Button>

        {showMore && (
          <div style={{ marginTop: 'var(--s4)' }}>
            {editing && (
              <Field label="Disponibilité">
                <Segmented
                  label="Disponibilité"
                  options={(['available', 'laundry', 'unavailable'] as const).map((a) => ({ value: a, label: AVAILABILITY_LABELS[a] }))}
                  value={draft.availability}
                  onChange={(v) => set('availability', v)}
                />
              </Field>
            )}
            <Field label="Couleurs secondaires">
              <ColorPicker label="Couleurs secondaires" multiple value={draft.secondaryColors} exclude={[draft.primaryColor]} onChange={(v) => set('secondaryColors', v.slice(0, 3))} />
            </Field>
            <Field label="Motif">
              <ChipGroup label="Motif" options={(Object.keys(PATTERN_LABELS) as Pattern[]).map((p) => ({ value: p, label: PATTERN_LABELS[p] }))} value={[draft.pattern]} onChange={(v) => set('pattern', v[0])} />
            </Field>
            <Field label="Saisons" hint={draft.seasons.length === 0 || draft.seasons.length === 4 ? "Toute l'année" : undefined}>
              <ChipGroup<Season> label="Saisons" multiple options={ALL_SEASONS.map((s) => ({ value: s, label: SEASON_LABELS[s] }))} value={draft.seasons} onChange={(v) => set('seasons', v)} />
            </Field>
            <Field label="Styles">
              <ChipGroup<Style> label="Styles" multiple options={ALL_STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }))} value={draft.styles} onChange={(v) => set('styles', v)} />
            </Field>
            <Field label="Formalité">
              <Segmented<Formality> label="Formalité" options={([1, 2, 3] as const).map((f) => ({ value: f, label: FORMALITY_LABELS[f] }))} value={draft.formality} onChange={(v) => set('formality', v)} />
            </Field>
            <Field label="Chaleur" hint={WARMTH_LABELS[draft.warmth]}>
              <div className="range-row">
                <span className="small muted">Léger</span>
                <input type="range" min={1} max={5} step={1} value={draft.warmth} aria-label="Niveau de chaleur" aria-valuetext={WARMTH_LABELS[draft.warmth]} onChange={(e) => set('warmth', Number(e.target.value) as Warmth)} />
                <span className="small muted">Chaud</span>
              </div>
            </Field>
            {draft.category !== 'shoes' && draft.category !== 'accessory' && (
              <Field label="Coupe">
                <Segmented<Silhouette | 'none'>
                  label="Coupe"
                  options={[{ value: 'none', label: 'Non précisée' }, ...(['ajuste', 'droit', 'ample'] as const).map((s) => ({ value: s, label: SILHOUETTE_LABELS[s] }))]}
                  value={draft.silhouette ?? 'none'}
                  onChange={(v) => set('silhouette', v === 'none' ? null : v)}
                />
              </Field>
            )}
            <Field label="Matière" htmlFor="g-mat" hint="Si vous la connaissez (ex. coton, laine, cuir).">
              <input id="g-mat" className="input" value={draft.material} maxLength={40} onChange={(e) => set('material', e.target.value)} />
            </Field>
            {(draft.category === 'outerwear' || draft.category === 'shoes') && (
              <div className="field">
                <label className="switch-row">
                  <span>Imperméable ou déperlant</span>
                  <input type="checkbox" checked={draft.waterproof} onChange={(e) => set('waterproof', e.target.checked)} style={{ width: 24, height: 24, accentColor: 'var(--text)' }} />
                </label>
              </div>
            )}
            <Field label="Notes" htmlFor="g-notes">
              <textarea id="g-notes" className="textarea" value={draft.notes} maxLength={300} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
