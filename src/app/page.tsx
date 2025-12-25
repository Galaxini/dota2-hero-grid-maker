"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useEffect } from "react";
import heroData from "@/data/dota2_heroes.json";
import defaultGrid from "@/data/hero_grid_config.json";

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

const DEFAULT_COLUMNS = 6;
const HERO_WIDTH = 42.009;
const HERO_HEIGHT = 74.009;
const HERO_GAP = 12.0608;
const POOL_ICON_SIZE = 40;
const BASE_CANVAS_WIDTH = 1176.521759;

const heroes = heroData as Hero[];
const seedGrid = defaultGrid as GridConfig;

const makeUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cat_${Math.random().toString(36).slice(2)}`;

const withCategoryUids = (configs: Config[]): ConfigWithUid[] =>
  configs.map((config) => ({
    ...config,
    categories: config.categories.map((category) => ({
      ...category,
      uid: makeUid(),
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

const computeLayout = (
  width: number,
  height: number,
  itemCount: number
) => {
  const safeWidth = Math.max(width, HERO_WIDTH);
  const safeHeight = Math.max(height, HERO_HEIGHT);
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

  const categories: CategoryWithUid[] = [
    { category_name: "Strength", hero_ids: byAttr.str, x_position: 0, y_position: 0, width: 0, height: 0, uid: makeUid() },
    { category_name: "Agility", hero_ids: byAttr.agi, x_position: 0, y_position: 0, width: 0, height: 0, uid: makeUid() },
    { category_name: "Intelligence", hero_ids: byAttr.int, x_position: 0, y_position: 0, width: 0, height: 0, uid: makeUid() },
    { category_name: "Universal", hero_ids: byAttr.all, x_position: 0, y_position: 0, width: 0, height: 0, uid: makeUid() },
  ];

  let currentY = 0;
  categories.forEach((category) => {
    const { width, height } = estimateCategorySize(category.hero_ids.length);
    category.width = width;
    category.height = height;
    category.x_position = 0;
    category.y_position = currentY;
    currentY += height + 20;
  });

  return {
    config_name: "Default Attributes",
    categories,
  };
};

export default function Home() {
  const [gridVersion, setGridVersion] = useState<number>(seedGrid.version ?? 3);
  const [configs, setConfigs] = useState<ConfigWithUid[]>(
    withCategoryUids(seedGrid.configs ?? [])
  );
  const [activeConfigIndex, setActiveConfigIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [attrFilter, setAttrFilter] = useState<
    "all" | "str" | "agi" | "int" | "uni"
  >("all");
  const [status, setStatus] = useState<string | null>(null);
  const [dragOverUid, setDragOverUid] = useState<string | null>(null);
  const [pickerCategoryUid, setPickerCategoryUid] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
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

  const heroById = useMemo(() => {
    const map = new Map<number, Hero>();
    heroes.forEach((hero) => map.set(hero.id, hero));
    return map;
  }, []);

  const activeConfig = configs[activeConfigIndex];

  const filteredHeroes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return heroes.filter((hero) => {
      if (attrFilter !== "all") {
        const targetAttr = attrFilter === "uni" ? "all" : attrFilter;
        if (hero.primaryAttr !== targetAttr) {
          return false;
        }
      }
      if (!normalizedQuery) return true;
      return hero.name.toLowerCase().includes(normalizedQuery);
    });
  }, [query, attrFilter]);

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
    ? Math.min(1, canvasWidth / canvasBounds.width)
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
          throw new Error("Invalid config format.");
        }
        setGridVersion(parsed.version ?? 3);
        setConfigs(withCategoryUids(parsed.configs));
        setActiveConfigIndex(0);
        setStatus("Config imported.");
      } catch (error) {
        setStatus("Failed to import JSON. Проверь формат файла.");
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
    setStatus("JSON downloaded.");
  };

  const updateActiveConfig = (updater: (config: ConfigWithUid) => ConfigWithUid) => {
    setConfigs((prev) =>
      prev.map((config, index) =>
        index === activeConfigIndex ? updater(config) : config
      )
    );
  };

  const handleDrop = (event: React.DragEvent, targetUid: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    const data = JSON.parse(raw) as {
      heroId: number;
      sourceUid?: string | null;
    };
    if (data.sourceUid && data.sourceUid === targetUid) {
      setDragOverUid(null);
      return;
    }
    const isCopy = event.altKey || !data.sourceUid;

    updateActiveConfig((config) => {
      const categories = config.categories.map((category) => {
        if (category.uid === targetUid) {
          if (category.hero_ids.includes(data.heroId)) {
            return category;
          }
          return {
            ...category,
            hero_ids: [...category.hero_ids, data.heroId],
          };
        }
        return category;
      });

      if (!isCopy && data.sourceUid) {
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
    updateActiveConfig((config) => {
      const maxY = Math.max(
        ...config.categories.map((category) => category.y_position + category.height),
        0
      );
      const newCategory: CategoryWithUid = {
        uid: makeUid(),
        category_name: "New Category",
        x_position: 0,
        y_position: maxY + 30,
        width: DEFAULT_COLUMNS * HERO_WIDTH + (DEFAULT_COLUMNS - 1) * HERO_GAP,
        height: HERO_HEIGHT * 2 + HERO_GAP,
        hero_ids: [],
      };
      return { ...config, categories: [...config.categories, newCategory] };
    });
  };

  const createConfig = () => {
    const fresh = buildDefaultConfig(heroes);
    setConfigs((prev) => {
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

  if (!activeConfig) {
    return (
      <div className="min-h-screen px-6 py-16 text-center text-sm text-[color:var(--mist)]">
        No configs loaded.
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="grid gap-6 rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)]/80 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.4em] text-[color:var(--gold)]">
                Dota 2 Grid Workshop
              </p>
              <h1 className="text-4xl font-[var(--font-display)] tracking-wide text-white">
                Hero Grid Maker
              </h1>
              <p className="max-w-xl text-sm text-[color:var(--mist)]">
                Перетаскивай героев, строй категории и экспортируй JSON, идентичный
                формату Dota 2. Alt + drag = копия, drag без Alt = перенос.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                Import JSON
              </button>
              <button
                onClick={downloadConfig}
                className="rounded-full bg-[color:var(--ember)] px-4 py-2 uppercase tracking-[0.2em] text-white shadow-[0_0_25px_rgba(231,91,58,0.45)] transition hover:-translate-y-0.5"
              >
                Export JSON
              </button>
              <button
                onClick={createConfig}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                New Config
              </button>
              <button
                onClick={normalizeLayout}
                className="rounded-full border border-[color:var(--faint)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
              >
                Normalize
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--mist)]">
            <label className="flex items-center gap-3">
              <span className="uppercase tracking-[0.2em]">Active config</span>
              <select
                value={activeConfigIndex}
                onChange={(event) => setActiveConfigIndex(Number(event.target.value))}
                className="rounded-full border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-white"
              >
                {configs.map((config, index) => (
                  <option key={config.config_name + index} value={index}>
                    {config.config_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3">
              <span className="uppercase tracking-[0.2em]">Name</span>
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
            <button
              onClick={addCategory}
              className="rounded-full border border-dashed border-[color:var(--faint)] px-4 py-2 uppercase tracking-[0.2em] text-[color:var(--mist)] transition hover:border-[color:var(--gold)] hover:text-white"
            >
              Add Category
            </button>
            <span className="text-[10px] uppercase tracking-[0.2em]">
              Version {gridVersion}
            </span>
          </div>
          {status ? (
            <div className="rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-xs text-[color:var(--mist)]">
              {status}
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
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--mist)]">
                Hero Pool
              </p>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search hero..."
                className="w-full rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-4 py-2 text-sm text-white outline-none transition focus:border-[color:var(--gold)]"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--mist)]">
              {[
                { label: "All", value: "all" },
                { label: "Str", value: "str" },
                { label: "Agi", value: "agi" },
                { label: "Int", value: "int" },
                { label: "Uni", value: "uni" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() =>
                    setAttrFilter(
                      item.value as "all" | "str" | "agi" | "int" | "uni"
                    )
                  }
                  className={`rounded-full px-3 py-1 transition ${
                    attrFilter === item.value
                      ? "bg-[color:var(--gold)] text-black"
                      : "border border-[color:var(--faint)] text-[color:var(--mist)] hover:border-[color:var(--gold)] hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-4 gap-2">
                {filteredHeroes.map((hero) => (
                  <button
                    key={hero.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({ heroId: hero.id })
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    className="group relative rounded-xl border border-[color:var(--faint)] bg-black/30 p-1 transition hover:border-[color:var(--gold)]"
                    title={hero.name}
                  >
                    <Image
                      src={hero.icon}
                      alt={hero.name}
                      width={POOL_ICON_SIZE}
                      height={POOL_ICON_SIZE}
                      className="rounded-lg"
                    />
                    <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-black/70 px-1 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                      {hero.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[color:var(--mist)]">
              <span>Canvas</span>
              <span>
                Categories {activeConfig.categories.length} · Heroes{" "}
                {activeConfig.categories.reduce((sum, category) => sum + category.hero_ids.length, 0)}
              </span>
            </div>
            <div
              ref={canvasRef}
              className="relative min-h-[60vh] overflow-hidden rounded-3xl border border-[color:var(--faint)] bg-[color:var(--panel)]/70 p-4 shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]"
              style={{ height: canvasBounds.height * scale + 40 }}
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
                  category.hero_ids.length + 1
                );
                const heroWidthPx = HERO_WIDTH * layout.scale * scale;
                const heroHeightPx = HERO_HEIGHT * layout.scale * scale;
                const gapPx = HERO_GAP * layout.scale * scale;
                const pickerOpen = pickerCategoryUid === category.uid;
                const pickerResults = heroes.filter((hero) =>
                  hero.name.toLowerCase().includes(pickerQuery.trim().toLowerCase())
                );
                return (
                  <div
                    key={category.uid}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, category.uid)}
                    onDragEnter={() => setDragOverUid(category.uid)}
                    onDragLeave={() =>
                      setDragOverUid((current) =>
                        current === category.uid ? null : current
                      )
                    }
                    onMouseDown={(event) => {
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
                    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--mist)]">
                      <input
                        data-no-drag
                        value={category.category_name}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateActiveConfig((config) => ({
                            ...config,
                            categories: config.categories.map((cat) =>
                              cat.uid === category.uid
                                ? { ...cat, category_name: value }
                                : cat
                            ),
                          }));
                        }}
                        className="w-full bg-transparent outline-none"
                      />
                      <button
                        data-no-drag
                        onClick={() =>
                          updateActiveConfig((config) => ({
                            ...config,
                            categories: config.categories.filter(
                              (cat) => cat.uid !== category.uid
                            ),
                          }))
                        }
                        className="text-[10px] uppercase tracking-[0.2em] hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${layout.columns}, ${heroWidthPx}px)`,
                        gridAutoRows: `${heroHeightPx}px`,
                        columnGap: `${gapPx}px`,
                        rowGap: `${gapPx}px`,
                      }}
                    >
                      {category.hero_ids.map((heroId) => {
                        const hero = heroById.get(heroId);
                        if (!hero) return null;
                        return (
                          <div
                            key={`${category.uid}-${heroId}`}
                            className="group relative flex items-center justify-center"
                            style={{ width: heroWidthPx, height: heroHeightPx }}
                          >
                            <button
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  "application/json",
                                  JSON.stringify({
                                    heroId: hero.id,
                                    sourceUid: category.uid,
                                  })
                                );
                                event.dataTransfer.effectAllowed = "copyMove";
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
                            <button
                              onClick={() => removeHeroFromCategory(category.uid, heroId)}
                              className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white group-hover:flex"
                              aria-label={`Remove ${hero.name}`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
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
                    </div>
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
                    {pickerOpen ? (
                      <div className="absolute inset-x-3 top-12 z-20 rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel)]/95 p-3 shadow-[0_15px_40px_rgba(0,0,0,0.45)]">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            data-no-drag
                            value={pickerQuery}
                            onChange={(event) => setPickerQuery(event.target.value)}
                            placeholder="Search hero..."
                            className="w-full rounded-xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)] px-3 py-1 text-xs text-white outline-none transition focus:border-[color:var(--gold)]"
                          />
                          <button
                            data-no-drag
                            onClick={() => setPickerCategoryUid(null)}
                            className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--mist)] hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                        <div className="mt-3 max-h-48 overflow-y-auto pr-1">
                          <div className="grid grid-cols-6 gap-2">
                            {pickerResults.map((hero) => (
                              <button
                                key={`${category.uid}-pick-${hero.id}`}
                                onClick={() => addHeroToCategory(category.uid, hero.id)}
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
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
