"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useEffect } from "react";
import heroData from "@/data/dota2_heroes.json";
import defaultGrid from "@/data/hero_grid_config.json";

type Hero = {
  id: number;
  name: string;
  icon: string;
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

const HERO_SIZE = 44;
const HERO_GAP = 6;
const CARD_PADDING = 12;
const TITLE_HEIGHT = 28;
const BASE_CANVAS_WIDTH = 1182;

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
  const columns = Math.max(5, Math.min(12, Math.ceil(heroCount / 2)));
  const width = columns * (HERO_SIZE + HERO_GAP) + CARD_PADDING * 2;
  const rows = Math.max(1, Math.ceil(heroCount / columns));
  const height = rows * (HERO_SIZE + HERO_GAP) + CARD_PADDING * 2 + TITLE_HEIGHT;
  return { width, height };
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
    const maxX = Math.max(
      ...activeConfig.categories.map((category) => category.x_position + category.width),
      BASE_CANVAS_WIDTH
    );
    const maxY = Math.max(
      ...activeConfig.categories.map((category) => category.y_position + category.height),
      600
    );
    return { width: maxX, height: maxY };
  }, [activeConfig]);

  const scale = canvasWidth
    ? Math.min(1, canvasWidth / canvasBounds.width)
    : 1;

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
          width: Math.max(width, 360),
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
        width: 320,
        height: 120,
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
                      width={HERO_SIZE}
                      height={HERO_SIZE}
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
                const columns = Math.max(
                  1,
                  Math.floor((category.width - CARD_PADDING * 2) / (HERO_SIZE + HERO_GAP))
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
                    className={`absolute rounded-2xl border border-[color:var(--faint)] bg-[color:var(--panel-bright)]/80 p-3 transition ${
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
                    <div className="flex items-center justify-between gap-2">
                      <input
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
                        className="w-full bg-transparent text-xs uppercase tracking-[0.2em] text-[color:var(--mist)] outline-none"
                      />
                      <button
                        onClick={() =>
                          updateActiveConfig((config) => ({
                            ...config,
                            categories: config.categories.filter(
                              (cat) => cat.uid !== category.uid
                            ),
                          }))
                        }
                        className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--mist)] hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                    <div
                      className="mt-2 grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      }}
                    >
                      {category.hero_ids.map((heroId) => {
                        const hero = heroById.get(heroId);
                        if (!hero) return null;
                        return (
                          <div key={`${category.uid}-${heroId}`} className="group relative">
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
                              className="rounded-lg border border-transparent transition hover:border-[color:var(--gold)]"
                              title={hero.name}
                            >
                              <Image
                                src={hero.icon}
                                alt={hero.name}
                                width={HERO_SIZE}
                                height={HERO_SIZE}
                                className="rounded-md"
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
                    </div>
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
