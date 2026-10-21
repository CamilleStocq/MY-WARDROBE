import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Availability, Garment, ManualWeather, Occasion, OutfitSlots, SavedOutfit, UserPreferences } from '../domain/types';
import { defaultPreferences } from '../domain/normalize';
import { currentSeason } from '../domain/taxonomy';
import { deriveNeeds, type WeatherNeeds } from '../engine/weatherNeeds';
import type { EngineContext } from '../engine/rules';
import { requestPersistence, StorageError } from '../services/db';
import * as garmentsApi from '../services/garmentService';
import * as outfitsApi from '../services/outfitService';
import { loadPreferences, savePreferences } from '../services/preferencesService';
import { getWeather, type WeatherResult } from '../services/weather/weatherService';
import { loadDemoWardrobe, removeDemoWardrobe } from '../services/demoData';
import { clearWornDay, loadCalendar, recentlyWorn, setWornDay, type Calendar } from '../services/calendarService';

export interface ToastMsg {
  id: number;
  message: string;
  tone?: 'default' | 'error';
  action?: { label: string; run: () => void };
}

interface WeatherState {
  result: WeatherResult | null;
  loading: boolean;
  manual: ManualWeather | null;
}

interface Store {
  ready: boolean;
  fatal: string | null;
  garments: Garment[];
  favorites: SavedOutfit[];
  prefs: UserPreferences;
  recent: string[][];
  calendar: Calendar;
  weather: WeatherState;
  needs: WeatherNeeds;

  createGarment: typeof garmentsApi.createGarment;
  saveGarment: (g: Garment) => Promise<Garment>;
  removeGarment: (g: Garment) => Promise<void>;
  setAvailability: (g: Garment, a: Availability) => Promise<void>;

  addFavorite: typeof outfitsApi.saveFavorite;
  saveFavorite: (o: SavedOutfit) => Promise<SavedOutfit>;
  removeFavorite: (o: SavedOutfit) => Promise<void>;

  setPrefs: (p: UserPreferences) => Promise<void>;
  logWorn: (date: string, slots: OutfitSlots, outfitId?: string | null) => Promise<void>;
  clearWorn: (date: string) => Promise<void>;
  /** ouverture du parcours « ajouter un vêtement » depuis n'importe quel écran */
  adding: boolean;
  setAdding: (v: boolean) => void;
  refreshWeather: (force?: boolean) => Promise<void>;
  setManualWeather: (m: ManualWeather | null) => void;
  rememberProposal: (slots: OutfitSlots) => Promise<void>;
  engineContext: (occasion: Occasion) => EngineContext;

  loadDemo: () => Promise<void>;
  removeDemo: () => Promise<void>;
  reloadAll: () => Promise<void>;

  toasts: ToastMsg[];
  toast: (message: string, opts?: Omit<ToastMsg, 'id' | 'message'>) => void;
  dismissToast: (id: number) => void;

  detailId: string | null;
  openGarment: (id: string | null) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore hors du StoreProvider');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [favorites, setFavorites] = useState<SavedOutfit[]>([]);
  const [prefs, setPrefsState] = useState<UserPreferences>(defaultPreferences);
  const [recent, setRecent] = useState<string[][]>([]);
  const [calendar, setCalendar] = useState<Calendar>({});
  const [adding, setAdding] = useState(false);
  const [weather, setWeather] = useState<WeatherState>({ result: null, loading: false, manual: null });
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const toastSeq = useRef(0);

  const toast = useCallback((message: string, opts: Omit<ToastMsg, 'id' | 'message'> = {}) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, message, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.action ? 7000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const fail = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error && e.message ? e.message : "L'opération n'a pas pu être enregistrée.";
      toast(msg, { tone: 'error' });
      throw e;
    },
    [toast],
  );

  const reloadAll = useCallback(async () => {
    try {
      const [g, f, p, r, c] = await Promise.all([
        garmentsApi.listGarments(),
        outfitsApi.listFavorites(),
        loadPreferences(),
        outfitsApi.getRecent(),
        loadCalendar(),
      ]);
      setCalendar(c);
      setGarments(g);
      setFavorites(f);
      setPrefsState(p);
      setRecent(r);
      setReady(true);
    } catch (e) {
      setFatal(e instanceof StorageError ? e.message : "Les données de l'application n'ont pas pu être chargées.");
    }
  }, []);

  useEffect(() => {
    reloadAll();
    requestPersistence();
  }, [reloadAll]);

  // ---------- météo ----------
  const locKey = prefs.location ? `${prefs.location.latitude},${prefs.location.longitude},${prefs.location.name}` : null;
  const refreshWeather = useCallback(
    async (force = false) => {
      const loc = prefs.location;
      if (!loc) {
        setWeather((w) => ({ ...w, result: null, loading: false }));
        return;
      }
      setWeather((w) => ({ ...w, loading: true }));
      const result = await getWeather(loc, { force });
      setWeather((w) => ({ ...w, result, loading: false }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locKey],
  );

  useEffect(() => {
    if (ready) refreshWeather();
  }, [ready, refreshWeather]);

  const setManualWeather = useCallback((m: ManualWeather | null) => setWeather((w) => ({ ...w, manual: m })), []);

  const needs = useMemo(() => {
    const r = weather.result;
    const usable = r?.snapshot && !r.outdated ? r.snapshot : null;
    return deriveNeeds({
      weather: weather.manual ? null : usable,
      isCached: r?.freshness === 'cache',
      manual: weather.manual,
      prefs,
    });
  }, [weather.result, weather.manual, prefs]);

  // ---------- vêtements ----------
  const createGarment = useCallback<Store['createGarment']>(
    async (data) => {
      try {
        const g = await garmentsApi.createGarment(data);
        setGarments((list) => [g, ...list]);
        return g;
      } catch (e) {
        return fail(e);
      }
    },
    [fail],
  );

  const saveGarment = useCallback(
    async (g: Garment) => {
      try {
        const next = await garmentsApi.updateGarment(g);
        setGarments((list) => list.map((x) => (x.id === next.id ? next : x)));
        return next;
      } catch (e) {
        return fail(e);
      }
    },
    [fail],
  );

  const removeGarment = useCallback(
    async (g: Garment) => {
      try {
        const deleted = await garmentsApi.deleteGarment(g);
        setGarments((list) => list.filter((x) => x.id !== g.id));
        toast(`« ${g.name} » supprimé`, {
          action: {
            label: 'Annuler',
            run: async () => {
              await garmentsApi.restoreGarment(deleted);
              setGarments((list) => [deleted.garment, ...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
              toast(`« ${g.name} » restauré`);
            },
          },
        });
      } catch (e) {
        fail(e);
      }
    },
    [fail, toast],
  );

  const setAvailability = useCallback(
    async (g: Garment, a: Availability) => {
      await saveGarment({ ...g, availability: a });
    },
    [saveGarment],
  );

  // ---------- favoris ----------
  const addFavorite = useCallback<Store['addFavorite']>(
    async (data) => {
      try {
        const o = await outfitsApi.saveFavorite(data);
        setFavorites((list) => [o, ...list]);
        return o;
      } catch (e) {
        return fail(e);
      }
    },
    [fail],
  );

  const saveFavorite = useCallback(
    async (o: SavedOutfit) => {
      try {
        const next = await outfitsApi.updateFavorite(o);
        setFavorites((list) => list.map((x) => (x.id === next.id ? next : x)));
        return next;
      } catch (e) {
        return fail(e);
      }
    },
    [fail],
  );

  const removeFavorite = useCallback(
    async (o: SavedOutfit) => {
      try {
        await outfitsApi.deleteFavorite(o.id);
        setFavorites((list) => list.filter((x) => x.id !== o.id));
        toast(`« ${o.name} » retirée des favoris`, {
          action: {
            label: 'Annuler',
            run: async () => {
              await outfitsApi.restoreFavorite(o);
              setFavorites((list) => [o, ...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
            },
          },
        });
      } catch (e) {
        fail(e);
      }
    },
    [fail, toast],
  );

  // ---------- préférences ----------
  const setPrefs = useCallback(
    async (p: UserPreferences) => {
      try {
        setPrefsState(await savePreferences(p));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const logWorn = useCallback(
    async (date: string, slots: OutfitSlots, outfitId: string | null = null) => {
      try {
        setCalendar(await setWornDay(date, slots, outfitId));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const clearWorn = useCallback(
    async (date: string) => {
      try {
        setCalendar(await clearWornDay(date));
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const rememberProposal = useCallback(async (slots: OutfitSlots) => {
    try {
      setRecent(await outfitsApi.pushRecent(slots));
    } catch {
      /* l'historique est un confort : on ne bloque pas */
    }
  }, []);

  const engineContext = useCallback(
    (occasion: Occasion): EngineContext => ({
      garments,
      needs,
      prefs,
      occasion,
      season: currentSeason(),
      // tenues réellement portées ces 14 derniers jours d'abord, puis les propositions récentes
      recent: [...recentlyWorn(calendar), ...recent],
      favorites: favorites.map((f) => [f.slots.top, f.slots.mid, f.slots.bottom, f.slots.onepiece, f.slots.outer, f.slots.shoes].filter((x): x is string => !!x).sort()),
    }),
    [garments, needs, prefs, recent, favorites, calendar],
  );

  const loadDemo = useCallback(async () => {
    try {
      const n = await loadDemoWardrobe();
      setGarments(await garmentsApi.listGarments());
      toast(`${n} pièces de démonstration ajoutées`);
    } catch (e) {
      fail(e);
    }
  }, [fail, toast]);

  const removeDemo = useCallback(async () => {
    try {
      await removeDemoWardrobe(garments);
      setGarments(await garmentsApi.listGarments());
      toast('Dressing de démonstration retiré');
    } catch (e) {
      fail(e);
    }
  }, [fail, toast, garments]);

  const value: Store = {
    ready,
    fatal,
    garments,
    favorites,
    prefs,
    recent,
    calendar,
    weather,
    needs,
    createGarment,
    saveGarment,
    removeGarment,
    setAvailability,
    addFavorite,
    saveFavorite,
    removeFavorite,
    setPrefs,
    logWorn,
    clearWorn,
    adding,
    setAdding,
    refreshWeather,
    setManualWeather,
    rememberProposal,
    engineContext,
    loadDemo,
    removeDemo,
    reloadAll,
    toasts,
    toast,
    dismissToast,
    detailId,
    openGarment: setDetailId,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
