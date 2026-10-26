import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Button, Field } from './primitives';
import { LocationPicker } from './weather/LocationSheet';

type Step = 'name' | 'place' | 'wardrobe';
const STEPS: Step[] = ['name', 'place', 'wardrobe'];

/**
 * Premier lancement : prénom, lieu pour la météo, premier vêtement.
 * Chaque étape peut être passée ; rien n'est obligatoire.
 */
export function Onboarding() {
  const { prefs, setPrefs, setAdding, loadDemo } = useStore();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(prefs.displayName);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // annonce chaque étape aux lecteurs d'écran
  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  // prefs à jour (le lieu choisi à l'étape 2 est déjà enregistré par LocationPicker)
  const finish = (patch: Partial<typeof prefs> = {}) => setPrefs({ ...prefs, ...patch, onboardingDone: true });

  async function saveName() {
    const n = name.trim().slice(0, 30);
    if (n !== prefs.displayName) await setPrefs({ ...prefs, displayName: n });
    setStep('place');
  }

  const index = STEPS.indexOf(step);

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb-inner">
        <div className="onb-top">
          <ol className="onb-progress" aria-label={`Étape ${index + 1} sur ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={i <= index ? 'done' : ''} />
            ))}
          </ol>
          <button type="button" className="link-btn muted-link" onClick={() => finish()}>
            Passer
          </button>
        </div>

        {step === 'name' && (
          <form
            className="onb-step"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <p className="onb-brand">My Wardrobe</p>
            <h1 id="onb-title" ref={titleRef} tabIndex={-1}>
              Votre dressing, une tenue chaque matin
            </h1>
            <p className="onb-text">
              Photographiez vos vêtements : l’app compose vos tenues uniquement avec ce que vous possédez, selon la météo de vos heures de sortie.
            </p>
            <Field label="Votre prénom" hint="Pour vous saluer à l’ouverture. Facultatif." htmlFor="onb-name">
              <input id="onb-name" className="input" autoComplete="given-name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="onb-actions">
              <Button type="submit" variant="primary" size="lg" block>
                Continuer
              </Button>
            </div>
          </form>
        )}

        {step === 'place' && (
          <div className="onb-step">
            <h1 id="onb-title" ref={titleRef} tabIndex={-1}>
              Où vous habillez-vous ?
            </h1>
            <p className="onb-text">La météo de ce lieu guide chaque tenue : pluie, vent, froid ressenti. Vous pourrez le changer à tout moment.</p>
            <LocationPicker onDone={() => setStep('wardrobe')} />
            <div className="onb-actions">
              {prefs.location ? (
                <Button variant="primary" size="lg" block onClick={() => setStep('wardrobe')}>
                  Continuer avec {prefs.location.name}
                </Button>
              ) : (
                <Button variant="ghost" block onClick={() => setStep('wardrobe')}>
                  Choisir plus tard
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'wardrobe' && (
          <div className="onb-step">
            <h1 id="onb-title" ref={titleRef} tabIndex={-1}>
              Ajoutez votre premier vêtement
            </h1>
            <p className="onb-text">
              Une photo suffit : le fond peut être retiré et les couleurs sont repérées automatiquement. Pour une première tenue, il faut au moins un haut et un bas, ou une robe.
            </p>
            <div className="onb-actions">
              <Button
                variant="primary"
                size="lg"
                block
                icon="camera"
                onClick={async () => {
                  await finish();
                  setAdding(true);
                }}
              >
                Photographier un vêtement
              </Button>
              <Button
                variant="outline"
                block
                loading={loadingDemo}
                onClick={async () => {
                  setLoadingDemo(true);
                  await loadDemo();
                  await finish();
                }}
              >
                Essayer avec un dressing de démonstration
              </Button>
              <p className="small muted">Les pièces de démonstration se retirent en un geste depuis Profil.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
