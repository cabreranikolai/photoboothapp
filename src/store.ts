import { create } from 'zustand';
import { sampleTemplate } from '../shared/samples';
import { newLayer, type Template, type Layer, type Asset } from '../shared/model';
type State = {
  template: Template;
  selected: string[];
  assets: Record<string, Asset>;
  past: Template[];
  future: Template[];
  dirty: boolean;
  setTemplate(t: Template): void;
  change(fn: (t: Template) => Template): void;
  update(id: string, patch: Partial<Layer>): void;
  select(ids: string[]): void;
  add(l: Layer): void;
  remove(): void;
  duplicate(): void;
  undo(): void;
  redo(): void;
  cache(a: Asset): void;
  saved(): void;
};
export const useStudio = create<State>((set, get) => ({
  template: sampleTemplate(),
  selected: [],
  assets: {},
  past: [],
  future: [],
  dirty: false,
  setTemplate: (template) => set({ template, selected: [], past: [], future: [], dirty: false }),
  change: (fn) =>
    set((s) => ({
      template: { ...fn(structuredClone(s.template)), updatedAt: new Date().toISOString() },
      past: [...s.past.slice(-59), s.template],
      future: [],
      dirty: true,
    })),
  update: (id, patch) =>
    get().change((t) => ({
      ...t,
      layers: t.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),
  select: (selected) => set({ selected }),
  add: (l) => {
    get().change((t) => ({ ...t, layers: [...t.layers, l] }));
    set({ selected: [l.id] });
  },
  remove: () => {
    const ids = get().selected;
    get().change((t) => ({
      ...t,
      layers: t.layers.filter((l) => !ids.includes(l.id) || l.locked),
    }));
    set({ selected: [] });
  },
  duplicate: () => {
    const copies = get()
      .template.layers.filter((l) => get().selected.includes(l.id))
      .map((l) =>
        newLayer(l.type, {
          ...l,
          id: crypto.randomUUID(),
          x: l.x + 30,
          y: l.y + 30,
          name: `${l.name} copy`,
          locked: false,
        }),
      );
    get().change((t) => ({ ...t, layers: [...t.layers, ...copies] }));
    set({ selected: copies.map((l) => l.id) });
  },
  undo: () =>
    set((s) =>
      s.past.length
        ? {
            template: s.past.at(-1)!,
            past: s.past.slice(0, -1),
            future: [s.template, ...s.future],
            dirty: true,
            selected: [],
          }
        : {},
    ),
  redo: () =>
    set((s) =>
      s.future.length
        ? {
            template: s.future[0],
            future: s.future.slice(1),
            past: [...s.past, s.template],
            dirty: true,
            selected: [],
          }
        : {},
    ),
  cache: (a) => set((s) => ({ assets: { ...s.assets, [a.id]: a } })),
  saved: () => set({ dirty: false }),
}));
