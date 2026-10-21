import { useEffect, useRef, useState } from 'react';
import type { Formality, GarmentCategory, Occasion, Style, UserPreferences, Warmth } from '../../domain/types';
import { ALL_STYLES, CATEGORY_ORDER, CATEGORY_SINGULAR, FORMALITY_LABELS, OCCASION_LABELS, STYLE_LABELS, WARMTH_LABELS } from '../../domain/taxonomy';
import { DEFAULT_THRESHOLDS } from '../../domain/normalize';
import { TREND_BASE, TREND_RULES } from '../../engine/trends';
import { WEIGHTS } from '../../engine/weights';
import { deleteEverything, exportBackup, importBackup, readBackup, type BackupFile, type BackupSummary } from '../../services/backupService';
import { weatherProvider } from '../../services/weather/weatherService';
import { kv, newId } from '../../services/db';
import { useStore } from '../../state/store';
import { Button, ChipGroup, ColorPicker, ConfirmDialog, Field, IconButton, Notice, Segmented } from '../primitives';
import { LocationPicker } from '../weather/LocationSheet';

export function SettingsScreen() {
  const { prefs, setPrefs, toast, garments, reloadAll, loadDemo } = useStore();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newSub, setNewSub] = useState<{ label: string; category: GarmentCategory; warmth: Warmth }>({ label: '', category: 'top', warmth: 2 });
  const importRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary; name: string } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ persisted: boolean | null; usedMb: number | null }>({ persisted: null, usedMb: null });

  useEffect(() => {
    kv.get<string>('backup:last').then((d) => setLastBackup(d ?? null)).catch(() => undefined);
    (async () => {
      try {
        const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
        const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
        setStorage({ persisted, usedMb: est?.usage != null ? Math.round((est.usage / 1024 / 1024) * 10) / 10 : null });
      } catch {
        /* informations indisponibles */
      }
    })();
  }, []);
  const backupAgeDays = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;

  const update = (patch: Partial<UserPreferences>) => setPrefs({ ...prefs, ...patch });
  const hours = Array.from({ length: 24 }, (_, h) => h);

  async function doExport() {
    setBusy('export');
    try {
      const blob = await exportBackup();
      const name = `my-wardrobe-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      let shared = false;
      // sur iPhone, le partage permet d'enregistrer directement dans Fichiers ou iCloud Drive
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Sauvegarde My Wardrobe' });
          shared = true;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // partage annulé
        }
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      const now = new Date().toISOString();
      await kv.set('backup:last', now).catch(() => undefined);
      setLastBackup(now);
      toast('Sauvegarde créée');
    } catch {
      toast('La sauvegarde n’a pas pu être créée.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function doImport(file?: File) {
    if (!file) return;
    setBusy('import');
    try {
      const v = await readBackup(file);
      if (!v.ok) toast(v.error, { tone: 'error' });
      else setPending({ backup: v.backup, summary: v.summary, name: file.name });
    } finally {
      setBusy(null);
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!pending) return;
    const { backup, summary } = pending;
    setPending(null);
    setBusy('import');
    try {
      await importBackup(backup);
      await reloadAll();
      toast(`Sauvegarde restaurée : ${summary.garments} vêtements, ${summary.outfits} favoris`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Profil</h1>
          <p className="sub">Tout est facultatif et modifiable à tout moment.</p>
        </div>
      </div>

      <div className="settings">
        <section className="panel">
          <h2>Vous</h2>
          <p className="panel-sub">Pour un accueil plus personnel.</p>
          <Field label="Prénom" htmlFor="p-name">
            <input id="p-name" className="input" defaultValue={prefs.displayName} maxLength={30} onBlur={(e) => e.target.value.trim() !== prefs.displayName && update({ displayName: e.target.value.trim() })} />
          </Field>
        </section>

        <section className="panel">
          <h2>Lieu et horaires</h2>
          <p className="panel-sub">La tenue tient compte de la météo prévue pendant vos heures de sortie.</p>
          <LocationPicker />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)', marginTop: 'var(--s5)' }}>
            <Field label="Je sors à partir de" htmlFor="out-start">
              <select id="out-start" className="select" value={prefs.outing.start} onChange={(e) => update({ outing: { ...prefs.outing, start: Number(e.target.value), end: Math.max(Number(e.target.value), prefs.outing.end) } })}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jusqu’à" htmlFor="out-end">
              <select id="out-end" className="select" value={prefs.outing.end} onChange={(e) => update({ outing: { ...prefs.outing, end: Number(e.target.value) } })}>
                {hours.filter((h) => h >= prefs.outing.start).map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="panel">
          <h2>Confort thermique</h2>
          <p className="panel-sub">Ajuste les seuils utilisés pour choisir les couches.</p>
          <Field label="Ma sensibilité au froid">
            <Segmented<UserPreferences['coldSensitivity']>
              label="Sensibilité au froid"
              value={prefs.coldSensitivity}
              onChange={(v) => update({ coldSensitivity: v })}
              options={[
                { value: -1, label: 'Sensible' },
                { value: 0, label: 'Moyenne' },
                { value: 1, label: 'Peu sensible' },
              ]}
            />
          </Field>
          <details style={{ marginTop: 'var(--s4)' }}>
            <summary style={{ fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>Seuils de température (avancé)</summary>
            <p className="small muted" style={{ margin: 'var(--s2) 0 var(--s3)' }}>Températures ressenties à partir desquelles le temps est considéré comme…</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--s3)' }}>
              {(
                [
                  ['hot', 'Chaud'],
                  ['warm', 'Agréable'],
                  ['mild', 'Doux'],
                  ['cool', 'Frais'],
                  ['cold', 'Froid'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={`${label} (°C)`} htmlFor={`th-${k}`}>
                  <input
                    id={`th-${k}`}
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={-20}
                    max={40}
                    defaultValue={prefs.thresholds[k]}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) update({ thresholds: { ...prefs.thresholds, [k]: v } });
                    }}
                  />
                </Field>
              ))}
            </div>
            <Button size="sm" variant="ghost" style={{ marginTop: 'var(--s2)' }} onClick={() => update({ thresholds: { ...DEFAULT_THRESHOLDS } })}>
              Rétablir les valeurs par défaut
            </Button>
          </details>
        </section>

        <section className="panel">
          <h2>Mon style</h2>
          <p className="panel-sub">Les recommandations s’en servent pour départager les tenues.</p>
          <Field label="Styles que j’aime">
            <ChipGroup<Style> label="Styles que j’aime" multiple options={ALL_STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }))} value={prefs.favoriteStyles} onChange={(v) => update({ favoriteStyles: v, avoidedStyles: prefs.avoidedStyles.filter((s) => !v.includes(s)) })} />
          </Field>
          <Field label="Styles à éviter">
            <ChipGroup<Style> label="Styles à éviter" multiple options={ALL_STYLES.map((s) => ({ value: s, label: STYLE_LABELS[s] }))} value={prefs.avoidedStyles} onChange={(v) => update({ avoidedStyles: v, favoriteStyles: prefs.favoriteStyles.filter((s) => !v.includes(s)) })} />
          </Field>
          <Field label="Couleurs préférées">
            <ColorPicker label="Couleurs préférées" multiple value={prefs.favoriteColors} exclude={prefs.rareColors} onChange={(v) => update({ favoriteColors: v })} />
          </Field>
          <Field label="Couleurs que je porte rarement">
            <ColorPicker label="Couleurs portées rarement" multiple value={prefs.rareColors} exclude={prefs.favoriteColors} onChange={(v) => update({ rareColors: v })} />
          </Field>
          <Field label="Niveau d’habillement habituel">
            <Segmented<Formality> label="Niveau d’habillement" value={prefs.usualFormality} onChange={(v) => update({ usualFormality: v })} options={([1, 2, 3] as const).map((f) => ({ value: f, label: FORMALITY_LABELS[f] }))} />
          </Field>
          <Field label="Priorité">
            <Segmented<UserPreferences['comfort']>
              label="Priorité"
              value={prefs.comfort}
              onChange={(v) => update({ comfort: v })}
              options={[
                { value: 'confort', label: 'Confort' },
                { value: 'equilibre', label: 'Équilibre' },
                { value: 'style', label: 'Style' },
              ]}
            />
          </Field>
          <Field label="Occasions fréquentes" hint="La première est sélectionnée par défaut chaque matin.">
            <ChipGroup<Occasion> label="Occasions fréquentes" multiple options={(Object.keys(OCCASION_LABELS) as Occasion[]).map((o) => ({ value: o, label: OCCASION_LABELS[o] }))} value={prefs.occasions} onChange={(v) => update({ occasions: v.length ? v : ['quotidien'] })} />
          </Field>
        </section>

        <section className="panel">
          <h2>Mes catégories</h2>
          <p className="panel-sub">Ajoutez vos propres types de pièces (ex. « Kimono », « Gilet sans manches »).</p>
          {prefs.customSubcategories.length > 0 && (
            <div className="custom-subs" style={{ marginBottom: 'var(--s4)' }}>
              {prefs.customSubcategories.map((c) => {
                const used = garments.filter((g) => g.subcategory === c.key).length;
                return (
                  <div key={c.key} className="custom-sub">
                    <span>
                      <b>{c.label}</b> · {CATEGORY_SINGULAR[c.category]} · {WARMTH_LABELS[c.warmth].toLowerCase()}
                    </span>
                    <IconButton
                      icon="trash"
                      label={`Supprimer la catégorie ${c.label}`}
                      disabled={used > 0}
                      title={used > 0 ? `Utilisée par ${used} vêtement(s)` : undefined}
                      onClick={() => update({ customSubcategories: prefs.customSubcategories.filter((x) => x.key !== c.key) })}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: 'grid', gap: 'var(--s3)' }}>
            <Field label="Nom" htmlFor="sub-label">
              <input id="sub-label" className="input" value={newSub.label} maxLength={30} onChange={(e) => setNewSub({ ...newSub, label: e.target.value })} />
            </Field>
            <Field label="Famille">
              <select className="select" aria-label="Famille" value={newSub.category} onChange={(e) => setNewSub({ ...newSub, category: e.target.value as GarmentCategory })}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_SINGULAR[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="outline"
              icon="plus"
              disabled={!newSub.label.trim()}
              onClick={() => {
                update({ customSubcategories: [...prefs.customSubcategories, { key: `custom-${newId().slice(0, 8)}`, label: newSub.label.trim(), category: newSub.category, warmth: newSub.warmth }] });
                setNewSub({ ...newSub, label: '' });
                toast(`Catégorie « ${newSub.label.trim()} » ajoutée`);
              }}
            >
              Ajouter la catégorie
            </Button>
          </div>
        </section>

        <section className="panel">
          <h2>Mes données</h2>
          <p className="panel-sub">
            Vos vêtements, photos, favoris et votre calendrier sont stockés uniquement sur cet appareil, dans l’app. Ils ne sont pas synchronisés : une sauvegarde régulière les protège en cas de perte du téléphone ou de suppression de l’app.
          </p>
          <dl className="props" style={{ marginBottom: 'var(--s4)' }}>
            <dt>Dernière sauvegarde</dt>
            <dd>{lastBackup ? new Date(lastBackup).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Jamais'}</dd>
            <dt>Stockage protégé</dt>
            <dd>{storage.persisted === null ? 'Information indisponible' : storage.persisted ? 'Oui' : 'Non (le navigateur peut l’effacer)'}</dd>
            {storage.usedMb !== null && (
              <>
                <dt>Espace utilisé</dt>
                <dd>{storage.usedMb.toLocaleString('fr-BE')} Mo</dd>
              </>
            )}
          </dl>
          {garments.length > 0 && (backupAgeDays === null || backupAgeDays > 14) && (
            <div style={{ marginBottom: 'var(--s4)' }}>
              <Notice tone="warn">
                {backupAgeDays === null ? 'Aucune sauvegarde pour l’instant.' : `Dernière sauvegarde il y a ${backupAgeDays} jours.`} Pensez à en télécharger une.
              </Notice>
            </div>
          )}
          <div className="row-gap">
            <Button variant="outline" icon="download" loading={busy === 'export'} onClick={doExport}>
              Télécharger une sauvegarde
            </Button>
            <Button variant="outline" icon="upload" loading={busy === 'import'} onClick={() => importRef.current?.click()}>
              Restaurer une sauvegarde
            </Button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
            {!garments.some((g) => g.isDemo) && (
              <Button variant="ghost" onClick={loadDemo}>
                Ajouter le dressing de démonstration
              </Button>
            )}
          </div>
          <Button variant="ghost" icon="trash" style={{ marginTop: 'var(--s4)', color: 'var(--danger)' }} onClick={() => setConfirmWipe(true)}>
            Supprimer toutes mes données
          </Button>
        </section>

        <section className="panel">
          <h2>Comment ça marche</h2>
          <p className="small muted" style={{ marginBottom: 'var(--s3)' }}>
            Météo : {weatherProvider.attribution.text}. L’Institut royal météorologique ne propose pas d’API de prévisions directement utilisable par une application web ; le fournisseur peut être remplacé sans changer le reste de l’application.
          </p>
          <p className="small muted" style={{ marginBottom: 'var(--s3)' }}>
            Tendances : {TREND_BASE.label.toLowerCase()} « {TREND_BASE.season} », {TREND_RULES.filter((r) => r.kind === 'seasonal').length} inspirations de saison et {TREND_RULES.filter((r) => r.kind === 'timeless').length} principes intemporels. {TREND_BASE.disclaimer}
          </p>
          <p className="small muted">
            Score d’une tenue : météo {Math.round(WEIGHTS.weather * 100)} %, couleurs {Math.round(WEIGHTS.color * 100)} %, styles {Math.round(WEIGHTS.style * 100)} %, motifs {Math.round(WEIGHTS.pattern * 100)} %, formalité{' '}
            {Math.round(WEIGHTS.formality * 100)} %, préférences {Math.round(WEIGHTS.preference * 100)} %, diversité {Math.round(WEIGHTS.diversity * 100)} %, saison, proportions et tendances pour le reste. La sécurité météo et la disponibilité des pièces sont vérifiées avant le score et ne peuvent pas être compensées.
          </p>
        </section>
      </div>

      {pending && (
        <ConfirmDialog
          title="Restaurer cette sauvegarde ?"
          message={
            <>
              {pending.name} : {pending.summary.garments} vêtement{pending.summary.garments > 1 ? 's' : ''}, {pending.summary.images} photo
              {pending.summary.images > 1 ? 's' : ''}, {pending.summary.outfits} favori{pending.summary.outfits > 1 ? 's' : ''}, {pending.summary.days} jour
              {pending.summary.days > 1 ? 's' : ''} de calendrier. Les éléments déjà présents sur l’appareil sont conservés ; ceux de la sauvegarde sont ajoutés ou mis à jour.
              {pending.summary.warnings.map((w) => (
                <span key={w} style={{ display: 'block', marginTop: 8 }}>
                  {w}
                </span>
              ))}
            </>
          }
          confirmLabel="Restaurer"
          onCancel={() => setPending(null)}
          onConfirm={confirmImport}
        />
      )}
      {confirmWipe && (
        <ConfirmDialog
          danger
          title="Supprimer toutes vos données ?"
          message={`Les ${garments.length} vêtements, leurs photos, vos favoris et vos préférences seront définitivement effacés de cet appareil. Téléchargez une sauvegarde avant si vous souhaitez les conserver.`}
          confirmLabel="Tout supprimer"
          onCancel={() => setConfirmWipe(false)}
          onConfirm={async () => {
            setConfirmWipe(false);
            await deleteEverything();
            await reloadAll();
            toast('Toutes les données ont été supprimées');
          }}
        />
      )}
    </>
  );
}
