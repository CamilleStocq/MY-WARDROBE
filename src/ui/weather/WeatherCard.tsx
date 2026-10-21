import { useState } from 'react';
import type { TemperatureBand } from '../../domain/types';
import { describeWeatherCode } from '../../services/weather/weatherCodes';
import { weatherProvider } from '../../services/weather/weatherService';
import { BAND_LABELS, type WeatherNeeds } from '../../engine/weatherNeeds';
import { useStore } from '../../state/store';
import { Button, IconButton, Notice, Segmented, Sheet } from '../primitives';
import { Icon } from '../Icon';
import { LocationSheet } from './LocationSheet';

const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });

/** Phrase de conseil générée à partir des besoins (et non d'un texte figé). */
export function adviceFor(n: WeatherNeeds): string | null {
  if (n.source === 'none') return null;
  const base: Record<TemperatureBand, string> = {
    freezing: 'Grand froid : manteau chaud, maille et accessoires bienvenus',
    cold: 'Il fait froid : misez sur un manteau et une maille',
    cool: 'Temps frais : une veste reste indispensable',
    mild: 'Temps doux : une tenue légère avec une couche à portée de main',
    warm: 'Temps agréable : des pièces légères suffisent',
    hot: 'Chaleur : des matières légères et respirantes, sans superposition',
  };
  const sentences = [base[n.band] + (n.variable && n.band !== 'hot' ? ', en plusieurs couches pour suivre la journée.' : '.')];
  if (n.rain === 'likely') sentences.push('Pluie probable : une veste imperméable et des chaussures fermées sont à privilégier.');
  else if (n.rain === 'possible') sentences.push('Quelques averses possibles.');
  if (n.windy) sentences.push('Le vent accentue la sensation de froid.');
  return sentences.join(' ');
}

export function WeatherCard() {
  const { prefs, weather, needs, refreshWeather } = useStore();
  const [locOpen, setLocOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const r = weather.result;
  const snap = r?.snapshot && !r.outdated ? r.snapshot : null;
  const manual = weather.manual;

  if (!prefs.location) {
    return (
      <>
        <div className="weather-card">
          <div className="weather-top">
            <span className="weather-icon">
              <Icon name="pin" />
            </span>
            <div className="weather-meta">
              <span className="cond">Où êtes-vous aujourd’hui ?</span>
              <span className="small muted">Pour adapter la tenue à la météo réelle.</span>
            </div>
          </div>
          <Button variant="secondary" icon="pin" onClick={() => setLocOpen(true)}>
            Choisir mon lieu
          </Button>
          {manual ? (
            <ManualSummary />
          ) : manualOpen ? (
            <ManualWeatherPicker />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setManualOpen(true)}>
              Indiquer le temps moi-même
            </Button>
          )}
        </div>
        {locOpen && <LocationSheet onClose={() => setLocOpen(false)} />}
      </>
    );
  }

  const cond = snap ? describeWeatherCode(snap.current.weatherCode) : null;
  const hours = snap?.hourly.filter((h) => {
    const hr = parseInt(h.time.slice(11, 13), 10);
    return hr >= 7 && hr <= 22;
  });

  return (
    <>
      <div className="weather-card" aria-busy={weather.loading}>
        <div className="weather-top">
          <span className="weather-icon">{cond ? <Icon name={cond.icon} size={28} /> : weather.loading ? <span className="spinner" /> : <Icon name="cloud" />}</span>
          <div className="weather-meta" style={{ flex: 1 }}>
            <button type="button" className="loc-btn" onClick={() => setLocOpen(true)} aria-label={`Lieu : ${prefs.location.name}. Modifier`}>
              <Icon name="pin" size={15} />
              {prefs.location.name}
            </button>
            {snap ? (
              <span className="cond">{cond?.label}</span>
            ) : weather.loading ? (
              <span className="muted small">Chargement de la météo…</span>
            ) : (
              <span className="cond">Météo indisponible</span>
            )}
          </div>
          {snap && <span className="weather-temp">{Math.round(snap.current.temperature)}°</span>}
        </div>

        {snap && (
          <>
            <div className="weather-facts">
              <span className="fact">
                <Icon name="thermo" size={14} /> Ressenti {Math.round(snap.current.feelsLike)}°
              </span>
              <span className="fact">
                {Math.round(snap.today.min)}° / {Math.round(snap.today.max)}°
              </span>
              {snap.today.precipitationProbabilityMax !== null && (
                <span className="fact">
                  <Icon name="umbrella" size={14} /> {snap.today.precipitationProbabilityMax} %
                  {snap.today.precipitationSum > 0 ? `, ${snap.today.precipitationSum.toLocaleString('fr-BE')} mm` : ''}
                </span>
              )}
              <span className="fact">
                <Icon name="wind" size={14} /> {Math.round(snap.today.windMax)} km/h
                {snap.today.gustMax >= 40 ? `, rafales ${Math.round(snap.today.gustMax)}` : ''}
              </span>
            </div>
            {hours && hours.length > 0 && (
              <div className="hours" aria-label="Prévisions heure par heure">
                {hours.map((h) => {
                  const hr = parseInt(h.time.slice(11, 13), 10);
                  const inWin = hr >= needs.window.start && hr <= needs.window.end;
                  return (
                    <div key={h.time} className={`hour ${inWin ? 'in-window' : ''}`}>
                      <span>{hr} h</span>
                      <Icon name={describeWeatherCode(h.weatherCode).icon} size={18} />
                      <b>{Math.round(h.temperature)}°</b>
                      {(h.precipitationProbability ?? 0) >= 30 && <span className="rain">{h.precipitationProbability}%</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {r?.freshness === 'cache' && r.snapshot && !r.outdated && (
          <Notice tone="warn" title="Données non actualisées">
            Service météo injoignable ({r.error}). Prévisions enregistrées à {time(r.snapshot.timestamp)}.
          </Notice>
        )}
        {r && !snap && !weather.loading && (
          <Notice
            tone="warn"
            title={r.outdated ? 'Les dernières prévisions datent d’un autre jour' : 'Météo indisponible'}
            actions={
              <Button size="sm" variant="outline" icon="refresh" onClick={() => refreshWeather(true)}>
                Réessayer
              </Button>
            }
          >
            {r.error ?? 'Le service ne répond pas.'} Vous pouvez indiquer le temps vous-même ci-dessous.
          </Notice>
        )}
        {r && !snap && !weather.loading && (manual ? <ManualSummary /> : <ManualWeatherPicker />)}

        <div className="weather-foot">
          <span>
            {snap ? (
              <>
                {r?.freshness === 'cache' ? 'Enregistré' : 'Mis à jour'} à {time(snap.timestamp)} ·{' '}
                <a href={weatherProvider.attribution.url} target="_blank" rel="noreferrer">
                  {weatherProvider.label}
                </a>
              </>
            ) : null}
          </span>
          <IconButton icon="refresh" label="Actualiser la météo" onClick={() => refreshWeather(true)} disabled={weather.loading} size={18} />
        </div>
      </div>
      {locOpen && <LocationSheet onClose={() => setLocOpen(false)} />}
    </>
  );
}

function ManualWeatherPicker() {
  const { setManualWeather } = useStore();
  const [band, setBand] = useState<TemperatureBand>('mild');
  const [rain, setRain] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      <span className="small" style={{ fontWeight: 700 }}>
        Ou dites-moi quel temps il fait
      </span>
      <Segmented<TemperatureBand>
        label="Température"
        value={band}
        onChange={setBand}
        options={(['cold', 'cool', 'mild', 'warm', 'hot'] as const).map((b) => ({ value: b, label: BAND_LABELS[b][0].toUpperCase() + BAND_LABELS[b].slice(1) }))}
      />
      <label className="switch-row small">
        <span>Il pleut ou des averses sont annoncées</span>
        <input type="checkbox" checked={rain} onChange={(e) => setRain(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--text)' }} />
      </label>
      <Button size="sm" variant="outline" onClick={() => setManualWeather({ band, rain, windy: false })}>
        Utiliser ce temps
      </Button>
    </div>
  );
}

function ManualSummary() {
  const { weather, setManualWeather } = useStore();
  const m = weather.manual!;
  return (
    <Notice
      tone="info"
      title="Météo saisie manuellement"
      actions={
        <Button size="sm" variant="outline" onClick={() => setManualWeather(null)}>
          Effacer
        </Button>
      }
    >
      Temps {BAND_LABELS[m.band]}
      {m.rain ? ', avec pluie' : ''}. Ces conditions ne viennent pas d’un service météo.
    </Notice>
  );
}

/**
 * Météo réduite à une ligne sobre (lieu · température · conditions) :
 * elle guide la tenue sans prendre la place de la composition. Le détail
 * (heures, pluie, vent, saisie manuelle) s'ouvre à la demande.
 */
export function WeatherLine() {
  const { prefs, weather, needs } = useStore();
  const [open, setOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const r = weather.result;
  const snap = r?.snapshot && !r.outdated ? r.snapshot : null;

  let text: string;
  let icon: 'pin' | 'cloud' | ReturnType<typeof describeWeatherCode>['icon'] = 'cloud';
  if (weather.manual) {
    text = `Temps ${BAND_LABELS[weather.manual.band]}${weather.manual.rain ? ', pluie' : ''} · saisi manuellement`;
  } else if (!prefs.location) {
    text = 'Choisir un lieu pour adapter la tenue à la météo';
    icon = 'pin';
  } else if (snap) {
    const c = describeWeatherCode(snap.current.weatherCode);
    icon = c.icon;
    const parts = [prefs.location.name, `${Math.round(snap.current.temperature)}°`, c.label, `ressenti ${Math.round(snap.current.feelsLike)}°`];
    if (needs.rain !== 'none' && needs.rainProbability !== null) parts.push(`pluie ${needs.rainProbability} %`);
    if (r?.freshness === 'cache') parts.push(`données de ${time(snap.timestamp)}`);
    text = parts.join(' · ');
  } else if (weather.loading) {
    text = `Météo de ${prefs.location.name}…`;
  } else {
    text = `${prefs.location.name} · météo indisponible`;
  }

  return (
    <>
      <button
        type="button"
        className="weather-line"
        onClick={() => (prefs.location || weather.manual ? setOpen(true) : setLocOpen(true))}
        aria-label={`Météo : ${text}. Voir le détail`}
      >
        {weather.loading && !snap ? <span className="spinner" aria-hidden /> : <Icon name={icon} size={18} />}
        <span className="wl-main">{text}</span>
        <span className="wl-chev">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <Sheet title="Météo du jour" onClose={() => setOpen(false)}>
          <WeatherCard />
          {adviceFor(needs) && (
            <p className="small" style={{ marginTop: 'var(--s4)' }}>
              {adviceFor(needs)}
            </p>
          )}
        </Sheet>
      )}
      {locOpen && <LocationSheet onClose={() => setLocOpen(false)} />}
    </>
  );
}
