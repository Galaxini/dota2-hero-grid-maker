"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useEffect, type FormEvent } from "react";
import heroData from "@/data/dota2_heroes.json";
import heroAliases from "@/data/hero_aliases.json";
import defaultGrid from "@/data/hero_grid_config.json";
import {
  getAuthToken,
  loginUser,
  registerUser,
  setAuthToken as persistAuthToken,
  getDefaultGrid,
  getUserGrids,
  createGrid,
} from "@/lib/api";

type Hero = {
  id: number;
  name: string;
  icon: string;
  img: string;
  primaryAttr?: "str" | "agi" | "int" | "all";
};

type Category = {
  category_name: string;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  hero_ids: number[];
};

type CategoryWithUid = Category & { uid: string };

type Config = {
  config_name: string;
  categories: Category[];
};

type ConfigWithUid = {
  config_name: string;
  categories: CategoryWithUid[];
};

type GridConfig = {
  version: number;
  configs: Config[];
};

type Language = "ru" | "en";

const DEFAULT_COLUMNS = 6;
const HERO_WIDTH = 42.78465715;
const HERO_HEIGHT = 74.09050379;
const HERO_GAP = 8.376072285;
const GRID_PADDING = HERO_GAP;
const POOL_ICON_SIZE = 40;
const BASE_CANVAS_WIDTH = 1182;

const heroes = heroData as Hero[];
const aliases = heroAliases as Record<string, string[]>;
const seedGrid = defaultGrid as GridConfig;

const makeUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cat_${Math.random().toString(36).slice(2)}`;

const makeStableUid = (configIndex: number, categoryIndex: number) =>
  `cat_${configIndex}_${categoryIndex}`;

const withCategoryUids = (configs: Config[]): ConfigWithUid[] =>
  configs.map((config) => ({
    ...config,
    categories: config.categories.map((category) => ({
      ...category,
      uid: makeUid(),
    })),
  }));

const withCategoryUidsStable = (configs: Config[]): ConfigWithUid[] =>
  configs.map((config, configIndex) => ({
    ...config,
    categories: config.categories.map((category, categoryIndex) => ({
      ...category,
      uid: makeStableUid(configIndex, categoryIndex),
    })),
  }));

const stripUids = (configs: ConfigWithUid[]): Config[] =>
  configs.map((config) => ({
    config_name: config.config_name,
    categories: config.categories.map(({ uid: _uid, ...rest }) => rest),
  }));

const estimateCategorySize = (heroCount: number) => {
  const columns = DEFAULT_COLUMNS;
  const rows = Math.max(1, Math.ceil(heroCount / columns));
  const width = columns * HERO_WIDTH + (columns - 1) * HERO_GAP;
  const height = rows * HERO_HEIGHT + (rows - 1) * HERO_GAP;
  return { width, height };
};

const normalizeQuery = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const insertHeroAt = (ids: number[], heroId: number, index: number) => {
  const next = ids.filter((id) => id !== heroId);
  const clampedIndex = Math.max(0, Math.min(index, next.length));
  next.splice(clampedIndex, 0, heroId);
  return next;
};

const translations = {
  en: {
    appKicker: "Dota 2 Grid Workshop",
    appTitle: "Hero Grid Maker",
    appSubtitle:
      "Drag heroes, build categories, and export JSON matching the Dota 2 format.",
    appHint: "Alt + drag = copy, drag without Alt = move.",
    importJson: "Import JSON",
    exportJson: "Export JSON",
    edit: "Edit",
    save: "Save",
    activeLayout: "Active layout",
    newLayout: "+ New Layout",
    deleteLayout: "Delete Layout",
    name: "Name",
    addCategory: "+ Add Category",
    currentMeta: "Current Meta 7.40b",
    metaHint: "Fixed meta list (temporary).",
    roleCarry: "Carry",
    roleMid: "Mid",
    roleOfflane: "Offlane",
    roleSoftSupport: "Soft Support",
    roleHardSupport: "Hard Support",
    noLayouts: "No layouts loaded.",
    importSuccess: "Layout imported.",
    importFail: "Failed to import JSON. Check the layout format.",
    downloadSuccess: "JSON downloaded.",
    invalidLayout: "Invalid layout format.",
    unsavedWarning: "Changes you made may not be saved.",
    deleteLayoutTitle: "Delete layout?",
    deleteLayoutBody: "Layout will be deleted and cannot be recovered.",
    cancel: "Cancel",
    delete: "Delete",
    chooseHero: "Choose a hero",
    searchHero: "Search hero...",
    close: "Close",
    categorySettings: "Category settings",
    deleteCategory: "Delete Category",
    deleteCategoryTitle: "Delete category?",
    deleteCategoryBody: "Category will be deleted and cannot be recovered.",
    category: "Category",
    newCategoryName: "New Category",
    cancelChangesTitle: "Cancel changes?",
    stay: "Stay",
    cancelChanges: "Discard",
    logoutTitle: "Log out?",
    logoutBody: "You will return to the default grid after logging out.",
    logoutConfirm: "Log out",
    hiddenHeroes: "Hidden: {{count}} heroes",
    hiddenHeroesTitle: "Hidden heroes",
    showHidden: "Show hidden",
    hideHidden: "Hide list",
    authRequired: "Authentication required.",
    authMissingFields: "Email and password are required.",
    authFailed: "Auth failed.",
    savedLocal: "Saved locally.",
    savedLocalAndServer: "Saved locally and to server.",
    saving: "Saving...",
    saveFailed: "Failed to save grid.",
    loggedIn: "Logged in.",
    registeredAndLoggedIn: "Registered and logged in.",
    loggedOut: "Logged out.",
    defaultGridInvalid: "Default grid data has an unexpected format.",
    defaultGridLoadFail: "Failed to load default grid.",
    savedGridInvalid: "Saved grid data has an unexpected format.",
    userGridsLoadFail: "Failed to load user grids.",
    defaultGridNoSaved: "Loaded default grid (no saved grid found).",
    loadedServerGrid: "Loaded grid from server.",
    keptLocalGrid: "Kept local grid.",
    shareWarning:
      "When you click Save, your grid may be shared to help other players.",
    serverGridPrompt:
      "A saved grid exists on the server. Load it? If you keep the local grid and save later, it will replace the server grid.",
  },
  ru: {
    appKicker: "Dota 2 Grid Workshop",
    appTitle: "Hero Grid Maker",
    appSubtitle:
      "Перетаскивай героев, строй категории и экспортируй JSON, идентичный формату Dota 2.",
    appHint: "Alt + drag = копия, drag без Alt = перенос.",
    importJson: "Импорт JSON",
    exportJson: "Экспорт JSON",
    edit: "Редактировать",
    save: "Сохранить",
    activeLayout: "Активный лейаут",
    newLayout: "+ Новый лейаут",
    deleteLayout: "Удалить лейаут",
    name: "Имя",
    addCategory: "+ Добавить категорию",
    currentMeta: "Текущая мета 7.40b",
    metaHint: "Фиксированный список меты (временно).",
    roleCarry: "Керри",
    roleMid: "Мид",
    roleOfflane: "Оффлейн",
    roleSoftSupport: "Частичная поддержка",
    roleHardSupport: "Полная поддержка",
    noLayouts: "Лейауты не загружены.",
    importSuccess: "Лейаут импортирован.",
    importFail: "Не удалось импортировать JSON. Проверь формат лейаута.",
    downloadSuccess: "JSON скачан.",
    invalidLayout: "Неверный формат лейаута.",
    unsavedWarning: "Изменения могут быть утеряны.",
    deleteLayoutTitle: "Удалить лейаут?",
    deleteLayoutBody: "Лейаут будет удалён без возможности восстановления.",
    cancel: "Отмена",
    delete: "Удалить",
    chooseHero: "Выберите героя",
    searchHero: "Поиск героя...",
    close: "Закрыть",
    categorySettings: "Настройки категории",
    deleteCategory: "Удалить категорию",
    deleteCategoryTitle: "Удалить категорию?",
    deleteCategoryBody: "Категория будет удалена без возможности восстановления.",
    category: "Категория",
    newCategoryName: "Новая категория",
    cancelChangesTitle: "Отменить изменения?",
    stay: "Остаться",
    cancelChanges: "Отменить",
    logoutTitle: "Выйти из аккаунта?",
    logoutBody: "После выхода вы вернётесь к дефолтному гриду.",
    logoutConfirm: "Выйти",
    hiddenHeroes: "Скрыто: {{count}} героев",
    hiddenHeroesTitle: "Скрытые герои",
    showHidden: "Показать",
    hideHidden: "Скрыть список",
    authRequired: "Требуется авторизация.",
    authMissingFields: "Нужны email и пароль.",
    authFailed: "Ошибка авторизации.",
    savedLocal: "Сохранено локально.",
    savedLocalAndServer: "Сохранено локально и на сервере.",
    saving: "Сохранение...",
    saveFailed: "Не удалось сохранить грид.",
    loggedIn: "Вход выполнен.",
    registeredAndLoggedIn: "Регистрация и вход выполнены.",
    loggedOut: "Вы вышли из аккаунта.",
    defaultGridInvalid: "Неверный формат дефолтного грида.",
    defaultGridLoadFail: "Не удалось загрузить дефолтный грид.",
    savedGridInvalid: "Неверный формат сохранённого грида.",
    userGridsLoadFail: "Не удалось загрузить гриды пользователя.",
    defaultGridNoSaved: "Загружен дефолтный грид (сохранений нет).",
    loadedServerGrid: "Загружен грид с сервера.",
    keptLocalGrid: "Оставлен локальный грид.",
    shareWarning:
      "Нажимая «Сохранить», вы соглашаетесь, что ваш грид может быть показан другим игрокам.",
    serverGridPrompt:
      "На сервере есть сохранённый грид. Загрузить его? Если оставить локальный и потом сохранить, он заменит грид на сервере.",
  },
} as const;

const META_ROLE_IDS = {
  carry: [67, 56, 6, 81, 54, 12, 42, 1, 11, 48],
  mid: [74, 59, 106, 36, 39, 76, 47, 13, 34, 25],
  offlane: [104, 14, 97, 28, 2, 29, 96, 98, 129, 60],
  softSupport: [14, 40, 101, 71, 22, 155, 26, 64, 86, 105],
  hardSupport: [31, 40, 27, 30, 68, 87, 14, 84, 37, 5],
};

const computeLayout = (
  width: number,
  height: number,
  itemCount: number
) => {
  const safeWidth = Math.max(width - GRID_PADDING * 2, HERO_WIDTH);
  const safeHeight = Math.max(height - GRID_PADDING * 2, HERO_HEIGHT);
  const totalItems = Math.max(1, itemCount);
  let best = { columns: 1, rows: totalItems, scale: 0 };

  for (let columns = 1; columns <= totalItems; columns += 1) {
    const rows = Math.max(1, Math.ceil(totalItems / columns));
    const denomX = columns * HERO_WIDTH + (columns - 1) * HERO_GAP;
    const denomY = rows * HERO_HEIGHT + (rows - 1) * HERO_GAP;
    if (denomX <= 0 || denomY <= 0) continue;
    const scaleX = safeWidth / denomX;
    const scaleY = safeHeight / denomY;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) continue;
    const rawScale = Math.min(scaleX, scaleY);
    if (rawScale <= 0) continue;
    const scale = Math.min(rawScale, 3);
    if (
      scale > best.scale + 1e-6 ||
      (Math.abs(scale - best.scale) <= 1e-6 && rows < best.rows) ||
      (Math.abs(scale - best.scale) <= 1e-6 && rows === best.rows && columns > best.columns)
    ) {
      best = { columns, rows, scale };
    }
  }

  return best;
};

const buildDefaultConfig = (heroesList: Hero[]): ConfigWithUid => {
  const byAttr = {
    str: [] as number[],
    agi: [] as number[],
    int: [] as number[],
    all: [] as number[],
  };

  heroesList.forEach((hero) => {
    const key = hero.primaryAttr ?? "all";
    if (key in byAttr) {
      byAttr[key as keyof typeof byAttr].push(hero.id);
    }
  });

  return {
    config_name: "Default Attributes",
    categories: [
      {
        uid: makeUid(),
        category_name: "Strength",
        x_position: 0,
        y_position: 0,
        width: 316.521759,
        height: 504.347839,
        hero_ids: byAttr.str,
      },
      {
        uid: makeUid(),
        category_name: "Agility",
        x_position: 320.869568,
        y_position: 0,
        width: 316.521759,
        height: 504.347839,
        hero_ids: byAttr.agi,
      },
      {
        uid: makeUid(),
        category_name: "Intelligence",
        x_position: 641.739136,
        y_position: 0,
        width: 316.521759,
        height: 504.347839,
        hero_ids: byAttr.int,
      },
      {
        uid: makeUid(),
        category_name: "Universal",
        x_position: 962.608704,
        y_position: 0,
        width: 213.913055,
        height: 504.347839,
        hero_ids: byAttr.all,
      },
    ],
  };
};

export default function Home() {
  const [gridVersion, setGridVersion] = useState<number>(seedGrid.version ?? 3);
  const [configs, setConfigs] = useState<ConfigWithUid[]>(() =>
    withCategoryUidsStable(seedGrid.configs ?? [])
  );
  const [activeConfigIndex, setActiveConfigIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [dragOverUid, setDragOverUid] = useState<string | null>(null);
  const [dragOverHero, setDragOverHero] = useState<{
    uid: string;
    index: number;
    position: "before" | "after";
  } | null>(null);
  const [pickerCategoryUid, setPickerCategoryUid] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null
  );
  const [categorySettingsUid, setCategorySettingsUid] = useState<string | null>(
    null
  );
  const [pendingCategoryDeleteUid, setPendingCategoryDeleteUid] = useState<
    string | null
  >(null);
  const [pendingCancelEdit, setPendingCancelEdit] = useState(false);
  const [pendingLogout, setPendingLogout] = useState(false);
  const [showHiddenHeroes, setShowHiddenHeroes] = useState(false);
  const [language, setLanguage] = useState<Language>("ru");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const t = translations[language];
  const editSnapshotRef = useRef<{
    version: number;
    configs: ConfigWithUid[];
    activeIndex: number;
  } | null>(null);
  const dragSourceRef = useRef<{
    uid: string;
    heroId: number;
    isCopy: boolean;
  } | null>(null);
  const dragDropHandledRef = useRef(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("dota2-grid-language") as Language | null)
        : null;
    if (saved === "ru" || saved === "en") {
      setLanguage(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dota2-grid-language", language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("dota2-grid-layouts");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as GridConfig;
      if (!parsed.configs || !Array.isArray(parsed.configs)) return;
      setGridVersion(parsed.version ?? 3);
      setConfigs(withCategoryUids(parsed.configs));
      const savedIndex = Number(
        window.localStorage.getItem("dota2-grid-active-layout")
      );
      if (Number.isFinite(savedIndex) && savedIndex >= 0) {
        setActiveConfigIndex(
          Math.min(savedIndex, parsed.configs.length - 1)
        );
      }
      setEditMode(false);
    } catch {
      // ignore corrupted cache
    }
  }, []);

  useEffect(() => {
    setAuthToken(getAuthToken());
  }, []);

  useEffect(() => {
    if (authToken) return;
    if (
      typeof window !== "undefined" &&
      window.localStorage.getItem("dota2-grid-layouts")
    ) {
      return;
    }
    let cancelled = false;
    const loadDefaultGrid = async () => {
      try {
        const record = await getDefaultGrid();
        if (cancelled) return;
        const data = record.data as GridConfig;
        if (!data?.configs || !Array.isArray(data.configs)) {
          setStatus(t.defaultGridInvalid);
          return;
        }
        setGridVersion(data.version ?? 3);
        setConfigs(withCategoryUids(data.configs));
        setActiveConfigIndex(0);
        setEditMode(false);
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? error.message
              : t.defaultGridLoadFail
          );
        }
      }
    };
    loadDefaultGrid();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    const loadUserGrid = async () => {
      try {
        const grids = await getUserGrids();
        if (cancelled) return;
        const hasLocal =
          typeof window !== "undefined" &&
          window.localStorage.getItem("dota2-grid-layouts");
        if (!grids.length) {
          if (hasLocal) {
            setStatus(t.keptLocalGrid);
            return;
          }
          const record = await getDefaultGrid();
          if (cancelled) return;
          const data = record.data as GridConfig;
          if (data?.configs && Array.isArray(data.configs)) {
            setGridVersion(data.version ?? 3);
            setConfigs(withCategoryUids(data.configs));
            setActiveConfigIndex(0);
            setEditMode(false);
            setStatus(t.defaultGridNoSaved);
          }
          return;
        }
        const latest = grids
          .slice()
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )[0];
        if (hasLocal) {
          const useServer = window.confirm(t.serverGridPrompt);
          if (!useServer) {
            setStatus(t.keptLocalGrid);
            return;
          }
        }
        const data = latest.data as GridConfig;
        if (!data?.configs || !Array.isArray(data.configs)) {
          setStatus(t.savedGridInvalid);
          return;
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "dota2-grid-layouts",
            JSON.stringify({
              version: data.version ?? 3,
              configs: data.configs,
            })
          );
        }
        setGridVersion(data.version ?? 3);
        setConfigs(withCategoryUids(data.configs));
        setActiveConfigIndex(0);
        setEditMode(false);
        setStatus(t.loadedServerGrid);
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error ? error.message : t.userGridsLoadFail
          );
        }
      }
    };
    loadUserGrid();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "dota2-grid-active-layout",
      String(activeConfigIndex)
    );
  }, [activeConfigIndex]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editMode) return;
      event.preventDefault();
      event.returnValue = t.unsavedWarning;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editMode, t.unsavedWarning]);

  useEffect(() => {
    if (editMode) {
      editSnapshotRef.current = {
        version: gridVersion,
        configs,
        activeIndex: activeConfigIndex,
      };
    }
  }, [editMode, gridVersion, configs, activeConfigIndex]);

  const [resizeState, setResizeState] = useState<{
    uid: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    uid: string;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPickerCategoryUid(null);
      setPendingRemoveIndex(null);
      setCategorySettingsUid(null);
      setPendingCategoryDeleteUid(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const heroById = useMemo(() => {
    const map = new Map<number, Hero>();
    heroes.forEach((hero) => map.set(hero.id, hero));
    return map;
  }, []);

  const hiddenHeroIds = useMemo(() => {
    const assigned = new Set<number>();
    configs.forEach((config) => {
      config.categories.forEach((category) => {
        category.hero_ids.forEach((id) => assigned.add(id));
      });
    });
    return heroes
      .map((hero) => hero.id)
      .filter((id) => !assigned.has(id));
  }, [configs]);

  const aliasById = useMemo(() => {
    const map = new Map<number, string[]>();
    heroes.forEach((hero) => {
      const list = aliases[hero.name] ?? [];
      map.set(hero.id, list.map(normalizeQuery).filter(Boolean));
    });
    return map;
  }, []);

  const matchesHeroQuery = (hero: Hero, normalized: string) => {
    if (!normalized) return true;
    if (normalizeQuery(hero.name).includes(normalized)) {
      return true;
    }
    const list = aliasById.get(hero.id) ?? [];
    return list.some((alias) => alias.includes(normalized));
  };

  const defaultGroups = useMemo(() => {
    const defaultConfig =
      seedGrid.configs?.find((config) => config.config_name === "default") ??
      seedGrid.configs?.find(
        (config) => config.config_name === "Default Attributes"
      );
    if (!defaultConfig) {
      return [
        { name: "Strength", heroIds: [] as number[] },
        { name: "Agility", heroIds: [] as number[] },
        { name: "Intelligence", heroIds: [] as number[] },
        { name: "Universal", heroIds: [] as number[] },
      ];
    }
    return defaultConfig.categories.map((category) => ({
      name: category.category_name,
      heroIds: category.hero_ids,
    }));
  }, []);

  const activeConfig = configs[activeConfigIndex];
  const pickerGroups = useMemo(() => {
    const normalized = normalizeQuery(pickerQuery);
    return defaultGroups
      .map((group) => {
        const heroesList = group.heroIds
          .map((heroId) => heroById.get(heroId))
          .filter((hero): hero is Hero => Boolean(hero))
          .filter((hero) => matchesHeroQuery(hero, normalized));
        return { name: group.name, heroes: heroesList };
      })
      .filter((group) => group.heroes.length > 0);
  }, [pickerQuery, defaultGroups, heroById, aliasById]);

  const metaRoles = useMemo(() => {
    const roles = [
      { key: "carry", name: t.roleCarry },
      { key: "mid", name: t.roleMid },
      { key: "offlane", name: t.roleOfflane },
      { key: "softSupport", name: t.roleSoftSupport },
      { key: "hardSupport", name: t.roleHardSupport },
    ] as const;

    return roles.map((role) => ({
      name: role.name,
      heroes: (META_ROLE_IDS[role.key] ?? [])
        .map((heroId) => heroById.get(heroId))
        .filter((hero): hero is Hero => Boolean(hero)),
    }));
  }, [heroById, t]);
  const pickerCategory = useMemo(
    () =>
      activeConfig?.categories.find(
        (category) => category.uid === pickerCategoryUid
      ) ?? null,
    [activeConfig, pickerCategoryUid]
  );

  const canvasBounds = useMemo(() => {
    if (!activeConfig) {
      return { width: BASE_CANVAS_WIDTH, height: 600 };
    }
    const widths = activeConfig.categories
      .map((category) => category.x_position + category.width)
      .filter((value) => Number.isFinite(value));
    const heights = activeConfig.categories
      .map((category) => category.y_position + category.height)
      .filter((value) => Number.isFinite(value));
    const maxX = Math.max(...widths, BASE_CANVAS_WIDTH);
    const maxY = Math.max(...heights, 600);
    return { width: maxX, height: maxY };
  }, [activeConfig]);

  const scale = canvasWidth
    ? canvasWidth >= 650
      ? Math.min(2, canvasWidth / canvasBounds.width)
      : 1
    : 1;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  useEffect(() => {
    if (!resizeState) return;
    const handleMove = (event: MouseEvent) => {
      event.preventDefault();
      const deltaX = (event.clientX - resizeState.startX) / safeScale;
      const deltaY = (event.clientY - resizeState.startY) / safeScale;
      const minWidth = HERO_WIDTH;
      const minHeight = HERO_HEIGHT;
      const maxWidth = Math.max(
        minWidth,
        BASE_CANVAS_WIDTH - resizeState.startLeft
      );
      const nextWidth = Math.min(
        maxWidth,
        Math.max(minWidth, resizeState.startWidth + deltaX)
      );
      const nextHeight = Math.max(minHeight, resizeState.startHeight + deltaY);
      if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
        return;
      }
      updateActiveConfig((config) => ({
        ...config,
        categories: config.categories.map((category) =>
          category.uid === resizeState.uid
            ? { ...category, width: nextWidth, height: nextHeight }
            : category
        ),
      }));
    };
    const handleUp = () => setResizeState(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizeState, safeScale]);

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (event: MouseEvent) => {
      event.preventDefault();
      const deltaX = (event.clientX - dragState.startX) / safeScale;
      const deltaY = (event.clientY - dragState.startY) / safeScale;
      const maxX = Math.max(0, BASE_CANVAS_WIDTH - dragState.startWidth);
      const nextX = Math.min(
        maxX,
        Math.max(0, dragState.startLeft + deltaX)
      );
      const nextY = Math.max(0, dragState.startTop + deltaY);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
        return;
      }
      updateActiveConfig((config) => ({
        ...config,
        categories: config.categories.map((category) =>
          category.uid === dragState.uid
            ? {
                ...category,
                x_position: nextX,
                y_position: nextY,
              }
            : category
        ),
      }));
    };
    const handleUp = () => setDragState(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, safeScale]);

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as GridConfig;
        if (!parsed.configs || !Array.isArray(parsed.configs)) {
          throw new Error(t.invalidLayout);
        }
        setGridVersion(parsed.version ?? 3);
        setConfigs(withCategoryUids(parsed.configs));
        setActiveConfigIndex(0);
        setStatus(t.importSuccess);
      } catch (error) {
        setStatus(t.importFail);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const downloadConfig = () => {
    const payload: GridConfig = {
      version: gridVersion,
      configs: stripUids(configs),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hero_grid_config.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(t.downloadSuccess);
  };

  const persistLayouts = () => {
    if (typeof window === "undefined") return;
    const payload: GridConfig = {
      version: gridVersion,
      configs: stripUids(configs),
    };
    window.localStorage.setItem(
      "dota2-grid-layouts",
      JSON.stringify(payload)
    );
  };

  const handleSave = async () => {
    persistLayouts();
    if (!authToken) {
      setStatus(t.savedLocal);
      setEditMode(false);
      return;
    }
    setSaveLoading(true);
    try {
      const payload: GridConfig = {
        version: gridVersion,
        configs: stripUids(configs),
      };
      await createGrid({
        title: activeConfig.config_name || "Hero Grid",
        data: payload,
      });
      setStatus(t.savedLocalAndServer);
      setEditMode(false);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : t.saveFailed
      );
    } finally {
      setSaveLoading(false);
    }
  };

  const updateActiveConfig = (updater: (config: ConfigWithUid) => ConfigWithUid) => {
    setConfigs((prev) =>
      prev.map((config, index) =>
        index === activeConfigIndex ? updater(config) : config
      )
    );
  };

  const computeInsertIndex = (
    event: React.DragEvent,
    heroCount: number,
    columns: number,
    heroWidthPx: number,
    heroHeightPx: number,
    gapPx: number
  ) => {
    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const cellWidth = heroWidthPx + gapPx;
    const cellHeight = heroHeightPx + gapPx;
    const rawX = event.clientX - rect.left - gapPx;
    const rawY = event.clientY - rect.top - gapPx;

    const safeX = Math.max(0, rawX);
    const safeY = Math.max(0, rawY);

    let col = Math.floor(safeX / cellWidth);
    let row = Math.floor(safeY / cellHeight);
    col = Math.max(0, Math.min(columns - 1, col));
    row = Math.max(0, row);

    const localX = safeX - col * cellWidth;
    const offset = localX > heroWidthPx / 2 ? 1 : 0;
    const baseIndex = row * columns + col;
    const insertIndex = baseIndex + offset;
    return Math.max(0, Math.min(heroCount, insertIndex));
  };

  const handleDrop = (event: React.DragEvent, targetUid: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const data = JSON.parse(raw) as {
      heroId: number;
      sourceUid?: string | null;
    };
    const isCopy = event.altKey || !data.sourceUid;
    const isSameCategory = data.sourceUid === targetUid;

    dragDropHandledRef.current = true;
    updateActiveConfig((config) => {
      let inserted = false;
      const categories = config.categories.map((category) => {
        if (category.uid === targetUid) {
          if (isCopy && category.hero_ids.includes(data.heroId)) {
            return category;
          }
          inserted = true;
          return {
            ...category,
            hero_ids: insertHeroAt(
              category.hero_ids,
              data.heroId,
              category.hero_ids.length
            ),
          };
        }
        return category;
      });

      if (!isCopy && inserted && data.sourceUid && !isSameCategory) {
        return {
          ...config,
          categories: categories.map((category) =>
            category.uid === data.sourceUid
              ? {
                  ...category,
                  hero_ids: category.hero_ids.filter((id) => id !== data.heroId),
                }
              : category
          ),
        };
      }
      return { ...config, categories };
    });
    setDragOverUid(null);
    setDragOverHero(null);
  };

  const handleHeroDrop = (
    event: React.DragEvent,
    targetUid: string,
    insertIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const data = JSON.parse(raw) as {
      heroId: number;
      sourceUid?: string | null;
    };
    const isCopy = event.altKey || !data.sourceUid;
    const isSameCategory = data.sourceUid === targetUid;

    dragDropHandledRef.current = true;
    updateActiveConfig((config) => {
      let inserted = false;
      const categories = config.categories.map((category) => {
        if (category.uid !== targetUid) {
          return category;
        }
        if (isCopy && category.hero_ids.includes(data.heroId)) {
          return category;
        }
        const sourceIndex = category.hero_ids.indexOf(data.heroId);
        const resolvedIndex =
          isSameCategory && sourceIndex > -1 && sourceIndex < insertIndex
            ? insertIndex - 1
            : insertIndex;
        inserted = true;
        return {
          ...category,
          hero_ids: insertHeroAt(
            category.hero_ids,
            data.heroId,
            resolvedIndex
          ),
        };
      });

      if (!isCopy && inserted && data.sourceUid && !isSameCategory) {
        return {
          ...config,
          categories: categories.map((category) =>
            category.uid === data.sourceUid
              ? {
                  ...category,
                  hero_ids: category.hero_ids.filter((id) => id !== data.heroId),
                }
              : category
          ),
        };
      }
      return { ...config, categories };
    });
    setDragOverUid(null);
    setDragOverHero(null);
  };

  const normalizeLayout = () => {
    updateActiveConfig((config) => {
      let cursorY = 0;
      const categories = config.categories.map((category) => {
        const { width, height } = estimateCategorySize(category.hero_ids.length);
        const normalized = {
          ...category,
          x_position: 0,
          y_position: cursorY,
          width: Math.max(
            width,
            DEFAULT_COLUMNS * HERO_WIDTH + (DEFAULT_COLUMNS - 1) * HERO_GAP
          ),
          height,
        };
        cursorY += normalized.height + 22;
        return normalized;
      });
      return { ...config, categories };
    });
  };

  const addCategory = () => {
    const newUid = makeUid();
    updateActiveConfig((config) => {
      const maxY = Math.max(
        ...config.categories.map((category) => category.y_position + category.height),
        0
      );
      const newCategory: CategoryWithUid = {
        uid: newUid,
        category_name: t.newCategoryName,
        x_position: 0,
        y_position: maxY + 30,
        width: 5 * HERO_WIDTH + 4 * HERO_GAP,
        height: HERO_HEIGHT + 2 * HERO_GAP,
        hero_ids: [],
      };
      return { ...config, categories: [...config.categories, newCategory] };
    });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const element = document.querySelector(
          `[data-category-uid="${newUid}"]`
        );
        if (element instanceof HTMLElement) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 0);
    }
  };

  const createConfig = () => {
    setConfigs((prev) => {
      const baseName = "Custom Layout";
      let name = baseName;
      let suffix = 1;
      const existing = new Set(prev.map((config) => config.config_name));
      while (existing.has(name)) {
        name = `${baseName} (${suffix})`;
        suffix += 1;
      }
      const fresh = buildDefaultConfig(heroes);
      fresh.config_name = name;
      const next = [...prev, fresh];
      setActiveConfigIndex(next.length - 1);
      return next;
    });
  };

  const removeHeroFromCategory = (categoryUid: string, heroId: number) => {
    updateActiveConfig((config) => ({
      ...config,
      categories: config.categories.map((category) =>
        category.uid === categoryUid
          ? {
              ...category,
              hero_ids: category.hero_ids.filter((id) => id !== heroId),
            }
          : category
      ),
    }));
  };

  const startCategoryDrag = (
    event: React.MouseEvent,
    category: CategoryWithUid
  ) => {
    event.preventDefault();
    setDragState({
      uid: category.uid,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: category.x_position,
      startTop: category.y_position,
      startWidth: category.width,
    });
  };

  const addHeroToCategory = (categoryUid: string, heroId: number) => {
    updateActiveConfig((config) => ({
      ...config,
      categories: config.categories.map((category) =>
        category.uid === categoryUid && !category.hero_ids.includes(heroId)
          ? { ...category, hero_ids: [...category.hero_ids, heroId] }
          : category
      ),
    }));
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const payload = { email: authEmail.trim(), password: authPassword };
      if (!payload.email || !payload.password) {
        setAuthError(t.authMissingFields);
        return;
      }
      if (authMode === "register") {
        await registerUser(payload);
      }
      const token = await loginUser(payload);
      setAuthToken(token);
      setAuthPassword("");
      setStatus(
        authMode === "register" ? t.registeredAndLoggedIn : t.loggedIn
      );
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t.authFailed);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    persistAuthToken(null);
    setAuthToken(null);
    setEditMode(false);
    setAuthError(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("dota2-grid-layouts");
      window.localStorage.removeItem("dota2-grid-active-layout");
    }
    setStatus(t.loggedOut);
  };

  if (!activeConfig) {
    return (
      <div className="min-h-screen px-6 py-16 text-center text-sm text-[color:var(--mist)]">
        {t.noLayouts}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-[color:var(--faint)] bg-[color:var(--ink)]/80 backdrop-blur">
        <div className="layout-shell mx-auto flex w-[75%] max-w-none flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-white">
              {t.appTitle}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
            <button
              onClick={() =>
                setLanguage((current) => (current === "ru" ? "en" : "ru"))
              }
              className="rounded-full border border-[color:var(--faint)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
            >
              {language === "ru" ? "EN" : "RU"}
            </button>
            {authToken ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="uppercase tracking-[0.2em] text-[color:var(--mist)]">
                  Authenticated
                </span>
                <button
                  type="button"
                  onClick={() => setPendingLogout(true)}
                  className="rounded-full border border-[color:var(--faint)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
                >
                  Logout
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleAuthSubmit}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="Email"
                  className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-white"
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Password"
                  className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-white"
                />
                <button
                  type="submit"
                  disabled={authLoading}
                  className="rounded-full bg-[color:var(--ember)] px-4 py-2 uppercase tracking-[0.2em] text-white shadow-[0_0_25px_rgba(231,91,58,0.35)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {authMode === "register" ? "Register" : "Login"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAuthMode((mode) =>
                      mode === "register" ? "login" : "register"
                    )
                  }
                  className="rounded-full border border-[color:var(--faint)] px-3 py-2 uppercase tracking-[0.2em] text-[10px] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
                >
                  {authMode === "register" ? "Have account?" : "Need account?"}
                </button>
              </form>
            )}
          </div>
        </div>
      </nav>
      <div className="layout-shell mx-auto flex w-[75%] max-w-none flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="grid gap-6 rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)]/80 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--gold)]">
                {t.appKicker}
              </p>
              <h1 className="text-4xl font-[var(--font-display)] tracking-wide text-white">
                {t.appTitle}
              </h1>
              <p className="max-w-xl text-sm text-[color:var(--mist)]">
                {t.appSubtitle} {t.appHint}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                {t.importJson}
              </button>
              <button
                onClick={downloadConfig}
                className="rounded-full bg-[color:var(--ember)] px-4 py-2 uppercase tracking-[0.2em] text-white shadow-[0_0_25px_rgba(231,91,58,0.45)] transition hover:-translate-y-0.5"
              >
                {t.exportJson}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--mist)]">
            <label className="flex items-center gap-3">
              <span className="uppercase tracking-[0.2em]">{t.activeLayout}</span>
              <select
                value={activeConfigIndex}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__new__") {
                    createConfig();
                    return;
                  }
                  setActiveConfigIndex(Number(value));
                }}
                className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-white"
              >
                {configs.map((config, index) => (
                  <option key={config.config_name + index} value={index}>
                    {config.config_name}
                  </option>
                ))}
                <option value="__new__">{t.newLayout}</option>
              </select>
            </label>
            <button
              onClick={() => {
                if (configs.length <= 1) return;
                setPendingRemoveIndex(activeConfigIndex);
              }}
              disabled={configs.length <= 1}
              className="rounded-full border border-red-500/60 px-4 py-2 uppercase tracking-[0.2em] text-red-200 transition hover:border-red-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-red-500/60 disabled:hover:text-red-200"
            >
              {t.deleteLayout}
            </button>
            <label className="flex items-center gap-3">
              <span className="uppercase tracking-[0.2em]">{t.name}</span>
              <input
                value={activeConfig.config_name}
                onChange={(event) => {
                  const value = event.target.value;
                  updateActiveConfig((config) => ({
                    ...config,
                    config_name: value,
                  }));
                }}
                className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-white"
              />
            </label>
            <div className="ml-auto" />
          </div>
          {status ? (
            <div className="rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-xs text-[color:var(--mist)]">
              {status}
            </div>
          ) : null}
          {authError ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
              {authError}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
          />
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4 rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)]/85 p-5 backdrop-blur">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--mist)]">
                {t.currentMeta}
              </p>
              <p className="text-[11px] text-[color:var(--mist)]">{t.metaHint}</p>
            </div>
            <div className="space-y-5">
              {metaRoles.map((role) => (
                <div key={role.name} className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[color:var(--mist)]">
                    <span>{role.name}</span>
                    <span className="h-px flex-1 bg-[color:var(--faint)]" />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {role.heroes.map((hero) => (
                      <div
                        key={`meta-${role.name}-${hero.id}`}
                        className="group relative rounded-xl border border-[color:var(--faint)] bg-black/30 p-1"
                        title={hero.name}
                      >
                        <button
                          type="button"
                          data-no-drag={!editMode}
                          draggable={editMode}
                          onDragStart={(event) => {
                            if (!editMode) return;
                            event.dataTransfer.setData(
                              "application/json",
                              JSON.stringify({ heroId: hero.id })
                            );
                            event.dataTransfer.effectAllowed = "copyMove";
                          }}
                          className="flex items-center justify-center rounded-lg transition hover:opacity-90"
                        >
                          <Image
                            src={hero.icon}
                            alt={hero.name}
                            width={POOL_ICON_SIZE}
                            height={POOL_ICON_SIZE}
                            className="rounded-lg"
                          />
                        </button>
                        <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-black/70 px-1 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                          {hero.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)]/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--mist)]">
                    {t.hiddenHeroes.replace(
                      "{{count}}",
                      String(hiddenHeroIds.length)
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowHiddenHeroes((prev) => !prev)}
                    className="rounded-full border border-[color:var(--faint)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
                  >
                    {showHiddenHeroes ? t.hideHidden : t.showHidden}
                  </button>
                </div>
                {showHiddenHeroes ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[color:var(--mist)]">
                      <span>{t.hiddenHeroesTitle}</span>
                      <span className="h-px flex-1 bg-[color:var(--faint)]" />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {hiddenHeroIds.map((heroId) => {
                        const hero = heroById.get(heroId);
                        if (!hero) return null;
                        return (
                          <div
                            key={`hidden-${hero.id}`}
                            className="group relative rounded-xl border border-[color:var(--faint)] bg-black/30 p-1"
                            title={hero.name}
                          >
                            <button
                              type="button"
                              data-no-drag={!editMode}
                              draggable={editMode}
                              onDragStart={(event) => {
                                if (!editMode) return;
                                event.dataTransfer.setData(
                                  "application/json",
                                  JSON.stringify({ heroId: hero.id })
                                );
                                event.dataTransfer.effectAllowed = "copyMove";
                              }}
                              className="flex items-center justify-center rounded-lg transition hover:opacity-90"
                            >
                              <Image
                                src={hero.icon}
                                alt={hero.name}
                                width={POOL_ICON_SIZE}
                                height={POOL_ICON_SIZE}
                                className="rounded-lg"
                              />
                            </button>
                            <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-black/70 px-1 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                              {hero.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section className="w-full min-w-0 space-y-4">
            <div className="h-0" />
            <div
              ref={canvasRef}
              className="w-full min-h-[60vh] overflow-auto rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)]/70 shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]"
              style={{ maxHeight: "80vh" }}
            >
              <div
                className="relative"
                style={{
                  width: canvasBounds.width * safeScale,
                  height: canvasBounds.height * safeScale,
                }}
              >
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                  backgroundSize: "80px 80px",
                  animation: "emberFloat 12s ease-in-out infinite",
                }}
              />
              {activeConfig.categories.map((category) => {
                const layout = computeLayout(
                  category.width,
                  category.height,
                  category.hero_ids.length + (editMode ? 1 : 0)
                );
                const heroWidthPx = HERO_WIDTH * layout.scale * scale;
                const heroHeightPx = HERO_HEIGHT * layout.scale * scale;
                const gapPx = HERO_GAP * layout.scale * scale;
                const pickerOpen = pickerCategoryUid === category.uid;
                return (
                  <div
                    key={category.uid}
                    data-category-uid={category.uid}
                    onDragOver={(event) => {
                      if (!editMode) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (!editMode) return;
                      handleDrop(event, category.uid);
                    }}
                    onDragEnter={() => {
                      if (!editMode) return;
                      setDragOverUid(category.uid);
                    }}
                    onDragLeave={() => {
                      if (!editMode) return;
                      setDragOverUid((current) =>
                        current === category.uid ? null : current
                      );
                      setDragOverHero((current) =>
                        current && current.uid === category.uid ? null : current
                      );
                    }}
                    onMouseDown={(event) => {
                      if (!editMode) return;
                      const target = event.target as HTMLElement;
                      if (target.closest("[data-no-drag]")) {
                        return;
                      }
                      startCategoryDrag(event, category);
                    }}
                    className={`absolute cursor-move rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)]/80 transition ${
                      dragOverUid === category.uid
                        ? "ring-2 ring-[color:var(--gold)]"
                        : ""
                    }`}
                    style={{
                      left: category.x_position * scale,
                      top: category.y_position * scale,
                      width: category.width * scale,
                      height: category.height * scale,
                      transformOrigin: "top left",
                    }}
                  >
                    <div className="absolute -top-5 left-0 z-20 flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[color:var(--mist)]">
                      <span className="text-[12px]">{category.category_name}</span>
                      {editMode ? (
                        <button
                          data-no-drag
                          onClick={() => {
                            setCategorySettingsUid(category.uid);
                          }}
                          className="mb-1 text-[20px] transition hover:text-white"
                        aria-label={t.categorySettings}
                          type="button"
                        >
                          ⚙
                        </button>
                      ) : null}
                    </div>
                    {editMode ? (
                      <div className="absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-black/70 to-transparent" />
                    ) : null}
                    <div
                      className="grid"
                      onDragOver={(event) => {
                        if (!editMode) return;
                        event.preventDefault();
                        const index = computeInsertIndex(
                          event,
                          category.hero_ids.length,
                          layout.columns,
                          heroWidthPx,
                          heroHeightPx,
                          gapPx
                        );
                        setDragOverHero({
                          uid: category.uid,
                          index,
                          position: "before",
                        });
                      }}
                      onDragLeave={() => {
                        if (!editMode) return;
                        setDragOverHero((current) =>
                          current && current.uid === category.uid ? null : current
                        );
                      }}
                      onDrop={(event) => {
                        if (!editMode) return;
                        event.stopPropagation();
                        const index = computeInsertIndex(
                          event,
                          category.hero_ids.length,
                          layout.columns,
                          heroWidthPx,
                          heroHeightPx,
                          gapPx
                        );
                        handleHeroDrop(event, category.uid, index);
                      }}
                      style={{
                        gridTemplateColumns: `repeat(${layout.columns}, ${heroWidthPx}px)`,
                        gridAutoRows: `${heroHeightPx}px`,
                        columnGap: `${gapPx}px`,
                        rowGap: `${gapPx}px`,
                        paddingLeft: `${gapPx}px`,
                        paddingRight: `${gapPx}px`,
                        paddingTop: `${gapPx}px`,
                        paddingBottom: `${gapPx}px`,
                      }}
                    >
                      {category.hero_ids.map((heroId, heroIndex) => {
                        const hero = heroById.get(heroId);
                        if (!hero) return null;
                        return (
                          <div
                            key={`${category.uid}-${heroId}`}
                            className="group relative flex items-center justify-center"
                            style={{ width: heroWidthPx, height: heroHeightPx }}
                            onDragOver={(event) => {
                              if (!editMode) return;
                              event.preventDefault();
                              event.stopPropagation();
                              const rect = (
                                event.currentTarget as HTMLDivElement
                              ).getBoundingClientRect();
                              const isRightHalf =
                                event.clientX - rect.left > rect.width / 2;
                              setDragOverHero({
                                uid: category.uid,
                                index: heroIndex + (isRightHalf ? 1 : 0),
                                position: isRightHalf ? "after" : "before",
                              });
                            }}
                            onDragEnter={() => {
                              if (!editMode) return;
                              setDragOverHero({
                                uid: category.uid,
                                index: heroIndex,
                                position: "before",
                              });
                            }}
                            onDragLeave={() => {
                              if (!editMode) return;
                              setDragOverHero((current) =>
                                current &&
                                current.uid === category.uid &&
                                (current.index === heroIndex ||
                                  current.index === heroIndex + 1)
                                  ? null
                                  : current
                              );
                            }}
                            onDrop={(event) => {
                              if (!editMode) return;
                              event.stopPropagation();
                              const rect = (
                                event.currentTarget as HTMLDivElement
                              ).getBoundingClientRect();
                              const isRightHalf =
                                event.clientX - rect.left > rect.width / 2;
                              handleHeroDrop(
                                event,
                                category.uid,
                                heroIndex + (isRightHalf ? 1 : 0)
                              );
                            }}
                          >
                            {dragOverHero &&
                            dragOverHero.uid === category.uid &&
                            dragOverHero.index === heroIndex ? (
                              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-l-md border-l-2 border-[color:var(--gold)] bg-[color:var(--gold)]/45 shadow-[0_0_12px_rgba(243,187,87,0.45)]" />
                            ) : null}
                            {dragOverHero &&
                            dragOverHero.uid === category.uid &&
                            dragOverHero.index === heroIndex + 1 ? (
                              <span className="pointer-events-none absolute inset-y-0 right-0 w-1/2 rounded-r-md border-r-2 border-[color:var(--gold)] bg-[color:var(--gold)]/45 shadow-[0_0_12px_rgba(243,187,87,0.45)]" />
                            ) : null}
                            <button
                              data-no-drag={!editMode}
                              draggable
                              onDragStart={(event) => {
                                if (!editMode) return;
                                dragDropHandledRef.current = false;
                                dragSourceRef.current = {
                                  uid: category.uid,
                                  heroId: hero.id,
                                  isCopy: event.altKey,
                                };
                                setDragOverHero({
                                  uid: category.uid,
                                  index: heroIndex,
                                  position: "before",
                                });
                                event.dataTransfer.setData(
                                  "application/json",
                                  JSON.stringify({
                                    heroId: hero.id,
                                    sourceUid: category.uid,
                                  })
                                );
                                event.dataTransfer.effectAllowed = "copyMove";
                              }}
                              onDragEnd={() => {
                                setDragOverHero(null);
                                const source = dragSourceRef.current;
                                if (
                                  editMode &&
                                  source &&
                                  !dragDropHandledRef.current &&
                                  !source.isCopy
                                ) {
                                  removeHeroFromCategory(source.uid, source.heroId);
                                }
                                dragSourceRef.current = null;
                                dragDropHandledRef.current = false;
                              }}
                              className="relative flex items-center justify-center rounded-md border border-transparent transition hover:border-[color:var(--gold)]"
                              style={{ width: heroWidthPx, height: heroHeightPx }}
                              title={hero.name}
                            >
                              <Image
                                src={hero.img}
                                alt={hero.name}
                                fill
                                sizes="100vw"
                                className="h-full w-full rounded-md object-cover"
                              />
                            </button>
                            {editMode ? (
                              <button
                                data-no-drag
                                onClick={() => removeHeroFromCategory(category.uid, heroId)}
                                className="absolute right-0 top-0 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[12px] text-white group-hover:flex"
                                aria-label={`Remove ${hero.name}`}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {editMode ? (
                        <button
                          data-no-drag
                          onClick={() => {
                            setPickerCategoryUid(category.uid);
                            setPickerQuery("");
                          }}
                          className="flex items-center justify-center rounded-md border border-dashed border-[color:var(--faint)] p-0 text-[20px] leading-none text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
                          style={{ width: heroWidthPx, height: heroHeightPx }}
                          aria-label="Add hero"
                          type="button"
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                    {editMode ? (
                      <button
                      data-no-drag
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setResizeState({
                          uid: category.uid,
                          startX: event.clientX,
                          startY: event.clientY,
                          startWidth: category.width,
                          startHeight: category.height,
                          startLeft: category.x_position,
                        });
                      }}
                      className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--faint)] bg-black/40 text-[10px] uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
                      aria-label="Resize category"
                      type="button"
                    >
                      ↘
                    </button>
                    ) : null}
                  </div>
                );
              })}
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className="floating-controls pointer-events-none fixed bottom-12 right-12 z-40 flex flex-col items-end gap-3">
        {editMode ? (
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              onClick={addCategory}
              className="h-[50px] w-[200px] rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white shadow-[0_0_20px_rgba(0,0,0,0.25)] transition hover:border-[color:var(--gold)]"
            >
              {t.addCategory}
            </button>
            {authToken ? (
              <p className="max-w-[260px] text-right text-[10px] text-[color:var(--mist)]">
                {t.shareWarning}
              </p>
            ) : null}
          </div>
        ) : null}
        {editMode ? (
          <button
            onClick={() => setPendingCancelEdit(true)}
            className="pointer-events-auto h-[50px] w-[200px] rounded-full border border-[color:var(--faint)] bg-[color:var(--panel)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--mist)] shadow-[0_0_20px_rgba(0,0,0,0.25)] transition hover:border-[color:var(--gold)] hover:text-white"
          >
            {t.cancel}
          </button>
        ) : null}
        <button
          onClick={() => {
            if (editMode) {
              void handleSave();
              return;
            }
            setEditMode(true);
          }}
          disabled={saveLoading}
          className={`pointer-events-auto h-[50px] w-[200px] rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-white shadow-[0_0_25px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 ${
            editMode
              ? "bg-emerald-500/90"
              : "bg-[color:var(--ember)]"
          } ${saveLoading ? "cursor-not-allowed opacity-70" : ""}`}
        >
          {editMode ? (saveLoading ? t.saving : t.save) : t.edit}
        </button>
      </div>
      {pendingRemoveIndex !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold text-white">
              {t.deleteLayoutTitle}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--mist)]">
              {t.deleteLayoutBody}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 text-xs uppercase tracking-[0.2em]">
              <button
                onClick={() => setPendingRemoveIndex(null)}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  if (pendingRemoveIndex === null) return;
                  setConfigs((prev) =>
                    prev.filter((_, index) => index !== pendingRemoveIndex)
                  );
                  setActiveConfigIndex((prev) =>
                    prev === pendingRemoveIndex ? 0 : Math.max(0, prev - 1)
                  );
                  setPendingRemoveIndex(null);
                }}
                className="rounded-full bg-[color:var(--ember)] px-4 py-2 text-white shadow-[0_0_25px_rgba(231,91,58,0.45)]"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingLogout ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold text-white">
              {t.logoutTitle}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--mist)]">
              {t.logoutBody}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 text-xs uppercase tracking-[0.2em]">
              <button
                onClick={() => setPendingLogout(false)}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  handleLogout();
                  setPendingLogout(false);
                }}
                className="rounded-full bg-[color:var(--ember)] px-4 py-2 text-white shadow-[0_0_25px_rgba(231,91,58,0.45)]"
              >
                {t.logoutConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pickerCategoryUid && editMode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-5xl rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--mist)]">
                  {t.chooseHero}
                </p>
                <p className="text-sm text-white">
                  {pickerCategory?.category_name || t.category}
                </p>
              </div>
              <input
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder={t.searchHero}
                className="w-full max-w-xs rounded-xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-3 py-2 text-xs text-white outline-none transition focus:border-[color:var(--gold)]"
              />
            </div>
            <div className="mt-4 max-h-[60vh] space-y-6 overflow-y-auto pr-1">
              {pickerGroups.map((group) => (
                <div key={group.name} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[color:var(--mist)]">
                    <span>{group.name}</span>
                    <span className="h-px flex-1 bg-[color:var(--faint)]" />
                  </div>
                  <div className="grid grid-cols-8 gap-2">
                    {group.heroes.map((hero) => (
                      <button
                        key={`picker-${group.name}-${hero.id}`}
                      onClick={() => {
                        addHeroToCategory(pickerCategoryUid, hero.id);
                        setPickerCategoryUid(null);
                      }}
                        className="group relative rounded-lg border border-transparent p-1 transition hover:border-[color:var(--gold)]"
                        title={hero.name}
                        type="button"
                      >
                        <Image
                          src={hero.icon}
                          alt={hero.name}
                          width={POOL_ICON_SIZE}
                          height={POOL_ICON_SIZE}
                          className="rounded-md"
                        />
                        <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-black/70 px-1 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                          {hero.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setPickerCategoryUid(null)}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {categorySettingsUid ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold text-white">
              {t.categorySettings}
            </h2>
            <div className="mt-4 space-y-3 text-xs text-[color:var(--mist)]">
              <label className="grid gap-2">
                <span className="uppercase tracking-[0.2em]">{t.name}</span>
                <input
                  value={
                    activeConfig.categories.find(
                      (category) => category.uid === categorySettingsUid
                    )?.category_name ?? ""
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    updateActiveConfig((config) => ({
                      ...config,
                      categories: config.categories.map((category) =>
                        category.uid === categorySettingsUid
                          ? { ...category, category_name: value }
                          : category
                      ),
                    }));
                  }}
                  className="rounded-xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-3 py-2 text-sm text-white outline-none transition focus:border-[color:var(--gold)]"
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setPendingCategoryDeleteUid(categorySettingsUid)}
                className="rounded-full border border-red-500/60 px-4 py-2 text-xs uppercase tracking-[0.2em] text-red-200 transition hover:border-red-400 hover:text-white"
              >
                {t.deleteCategory}
              </button>
              <button
                onClick={() => setCategorySettingsUid(null)}
                className="rounded-full bg-emerald-500/90 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white shadow-[0_0_25px_rgba(16,185,129,0.35)] transition hover:-translate-y-0.5"
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingCategoryDeleteUid ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold text-white">
              {t.deleteCategoryTitle}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--mist)]">
              {t.deleteCategoryBody}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 text-xs uppercase tracking-[0.2em]">
              <button
                onClick={() => setPendingCategoryDeleteUid(null)}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  updateActiveConfig((config) => ({
                    ...config,
                    categories: config.categories.filter(
                      (category) => category.uid !== pendingCategoryDeleteUid
                    ),
                  }));
                  setPendingCategoryDeleteUid(null);
                  setCategorySettingsUid(null);
                }}
                className="rounded-full bg-[color:var(--ember)] px-4 py-2 text-white shadow-[0_0_25px_rgba(231,91,58,0.45)]"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingCancelEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold text-white">
              {t.cancelChangesTitle}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--mist)]">
              {t.unsavedWarning}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 text-xs uppercase tracking-[0.2em]">
              <button
                onClick={() => setPendingCancelEdit(false)}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                {t.stay}
              </button>
              <button
                onClick={() => {
                  const snapshot = editSnapshotRef.current;
                  if (!snapshot) {
                    setPendingCancelEdit(false);
                    return;
                  }
                  const stored =
                    typeof window !== "undefined"
                      ? window.localStorage.getItem("dota2-grid-layouts")
                      : null;
                  if (stored) {
                    try {
                      const parsed = JSON.parse(stored) as GridConfig;
                      if (parsed.configs && Array.isArray(parsed.configs)) {
                        setGridVersion(parsed.version ?? snapshot.version);
                        setConfigs(withCategoryUids(parsed.configs));
                        const savedIndex = Number(
                          window.localStorage.getItem("dota2-grid-active-layout")
                        );
                        if (Number.isFinite(savedIndex) && savedIndex >= 0) {
                          setActiveConfigIndex(
                            Math.min(savedIndex, parsed.configs.length - 1)
                          );
                        } else {
                          setActiveConfigIndex(snapshot.activeIndex);
                        }
                      } else {
                        setGridVersion(snapshot.version);
                        setConfigs(snapshot.configs);
                        setActiveConfigIndex(snapshot.activeIndex);
                      }
                    } catch {
                      setGridVersion(snapshot.version);
                      setConfigs(snapshot.configs);
                      setActiveConfigIndex(snapshot.activeIndex);
                    }
                  } else {
                    setGridVersion(snapshot.version);
                    setConfigs(snapshot.configs);
                    setActiveConfigIndex(snapshot.activeIndex);
                  }
                  setEditMode(false);
                  setPendingCancelEdit(false);
                  setPickerCategoryUid(null);
                  setPendingRemoveIndex(null);
                  setCategorySettingsUid(null);
                  setPendingCategoryDeleteUid(null);
                }}
                className="rounded-full bg-[color:var(--ember)] px-4 py-2 text-white shadow-[0_0_25px_rgba(231,91,58,0.45)]"
              >
                {t.cancelChanges}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
