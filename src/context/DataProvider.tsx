import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { GLOBAL_CATALOG, GLOBAL_IDS } from '@/lib/catalog';
import { newId, nowIso } from '@/lib/ids';
import { localRepo } from '@/lib/repo/localRepo';
import { dependencyOrder, migrateLocalToRemote } from '@/lib/repo/migrate';
import { RemoteRepo } from '@/lib/repo/remoteRepo';
import type { Repo } from '@/lib/repo/types';
import { normalizeName, parentsOf, type NeedsContext } from '@/lib/shopping';
import { emptySnapshot, type Ingredient, type MealPlan, type PublicRecipeTree, type Recipe, type ShoppingExtra, type Snapshot } from '@/lib/types';
import { useAuth } from './AuthProvider';

type DataState = {
  /** Dados do modo atual (celular/conta) carregados. */
  ready: boolean;
  /** Já carregou alguma vez desde que o app abriu. */
  initialized: boolean;
  /** Mensagem exibida enquanto carrega (ex.: migração para a conta). */
  status: string | null;
  error: string | null;
  reload: () => void;
  isGuest: boolean;

  catalog: Ingredient[];
  ingredientName: (id: string) => string;
  findIngredientByName: (name: string) => Ingredient | undefined;
  addIngredient: (name: string) => Promise<Ingredient | null>;

  recipes: Recipe[];
  getRecipe: (id: string) => Recipe | undefined;
  saveRecipe: (recipe: Recipe) => Promise<boolean>;
  deleteRecipe: (id: string) => Promise<boolean>;
  findCopyOf: (publicRecipeId: string) => Recipe | undefined;
  saveCopy: (tree: PublicRecipeTree) => Promise<string | null>;

  pantryIngredients: Set<string>;
  pantryRecipes: Set<string>;
  setHasIngredient: (id: string, has: boolean) => Promise<boolean>;
  setHasRecipe: (id: string, has: boolean) => Promise<boolean>;

  mealPlans: MealPlan[];
  addMealPlan: (date: string, recipeId: string) => Promise<boolean>;
  removeMealPlan: (id: string) => Promise<boolean>;

  extras: ShoppingExtra[];
  addExtra: (weekStart: string, name: string, quantity: number | null, unit: string | null) => Promise<boolean>;
  setExtraPurchased: (id: string, purchased: boolean) => Promise<boolean>;
  deleteExtra: (id: string) => Promise<boolean>;

  /** Contexto de cálculo do "o que comprar" para as receitas da coleção. */
  needsContext: NeedsContext;
};

const DataContext = createContext<DataState | null>(null);

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');

export function DataProvider({ children }: { children: ReactNode }) {
  const { userId, loading: authLoading } = useAuth();
  const key = userId ?? 'local';
  const repo: Repo = useMemo(() => (userId ? new RemoteRepo(userId) : localRepo), [userId]);

  const [snap, setSnap] = useState<Snapshot>(emptySnapshot);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Carrega os dados do modo atual (celular ou conta). No login, migra antes os dados locais.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        if (repo instanceof RemoteRepo && !(await localRepo.isEmpty())) {
          if (!cancelled) setStatus('Enviando suas receitas para a conta...');
          await migrateLocalToRemote(repo);
        }
        const data = await repo.loadAll();
        if (cancelled) return;
        setSnap(data);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) {
          setStatus(null);
          setLoadedKey(key);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, key, authLoading, reloadTick]);

  // ---------------------------------------------------------------- derivados
  const catalog = useMemo(() => [...GLOBAL_CATALOG, ...snap.customIngredients].sort(byName), [snap.customIngredients]);
  const ingredientById = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const recipeById = useMemo(() => new Map(snap.recipes.map((r) => [r.id, r])), [snap.recipes]);
  const recipes = useMemo(() => [...snap.recipes].sort(byName), [snap.recipes]);
  const pantryIngredients = useMemo(() => new Set(snap.pantryIngredientIds), [snap.pantryIngredientIds]);
  const pantryRecipes = useMemo(() => new Set(snap.pantryRecipeIds), [snap.pantryRecipeIds]);

  const ingredientName = useCallback((id: string) => ingredientById.get(id)?.name ?? 'Ingrediente', [ingredientById]);
  const getRecipe = useCallback((id: string) => recipeById.get(id), [recipeById]);
  const findIngredientByName = useCallback(
    (name: string) => {
      const n = normalizeName(name);
      return catalog.find((i) => normalizeName(i.name) === n);
    },
    [catalog],
  );
  const findCopyOf = useCallback((publicId: string) => snap.recipes.find((r) => r.originRecipeId === publicId), [snap.recipes]);

  const needsContext = useMemo<NeedsContext>(
    () => ({
      getRecipe: (id) => recipeById.get(id),
      ingredientName,
      hasIngredient: (id) => pantryIngredients.has(id),
      hasRecipe: (id) => pantryRecipes.has(id),
    }),
    [recipeById, ingredientName, pantryIngredients, pantryRecipes],
  );

  // ----------------------------------------------------------------- mutações
  /** Aplica a mudança na tela na hora e grava; se falhar, avisa e recarrega do armazenamento. */
  const run = useCallback(
    async (optimistic: (s: Snapshot) => Snapshot, action: () => Promise<void>): Promise<boolean> => {
      setSnap(optimistic);
      try {
        await action();
        return true;
      } catch (e) {
        Alert.alert('Não foi possível salvar', (e as Error).message);
        repo.loadAll().then(setSnap, () => undefined);
        return false;
      }
    },
    [repo],
  );

  const addIngredient = useCallback(
    async (name: string) => {
      const existing = findIngredientByName(name);
      if (existing) return existing;
      const ingredient: Ingredient = { id: newId(), name: name.trim(), unit: null, custom: true };
      const ok = await run((s) => ({ ...s, customIngredients: [...s.customIngredients, ingredient] }), () => repo.createIngredient(ingredient));
      return ok ? ingredient : null;
    },
    [findIngredientByName, repo, run],
  );

  const saveRecipe = useCallback(
    async (recipe: Recipe) => {
      const toSave: Recipe = { ...recipe, isPublic: userId ? recipe.isPublic : false, updatedAt: nowIso() };
      const ok = await run(
        (s) => {
          const exists = s.recipes.some((r) => r.id === toSave.id);
          return { ...s, recipes: exists ? s.recipes.map((r) => (r.id === toSave.id ? toSave : r)) : [...s.recipes, toSave] };
        },
        () => repo.saveRecipe(toSave),
      );
      // Ao publicar, o servidor também publica as subreceitas: recarrega para refletir.
      if (ok && toSave.isPublic && toSave.items.some((i) => i.subRecipeId)) repo.loadAll().then(setSnap, () => undefined);
      return ok;
    },
    [repo, run, userId],
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      const parents = parentsOf(snap.recipes, id);
      if (parents.length) {
        Alert.alert('Não é possível excluir', `Esta receita é usada em: ${parents.map((p) => p.name).join(', ')}. Remova-a dessas receitas primeiro.`);
        return false;
      }
      return run(
        (s) => ({
          ...s,
          recipes: s.recipes.filter((r) => r.id !== id),
          mealPlans: s.mealPlans.filter((p) => p.recipeId !== id),
          pantryRecipeIds: s.pantryRecipeIds.filter((r) => r !== id),
        }),
        () => repo.deleteRecipe(id),
      );
    },
    [repo, run, snap.recipes],
  );

  /** Salva na coleção uma cópia da receita pública (e das subreceitas que ainda não tiver). */
  const saveCopy = useCallback(
    async (tree: PublicRecipeTree) => {
      const already = findCopyOf(tree.root.id);
      if (already) return already.id;

      try {
        // Ingredientes: globais mantêm o ID; personalizados de outra pessoa viram seus (pelo nome).
        const ingredientMap = new Map<string, string>();
        const created: Ingredient[] = [];
        for (const [id, name] of Object.entries(tree.ingredientNames)) {
          if (GLOBAL_IDS.has(id)) {
            ingredientMap.set(id, id);
            continue;
          }
          const n = normalizeName(name);
          const mine = catalog.find((i) => normalizeName(i.name) === n) ?? created.find((i) => normalizeName(i.name) === n);
          if (mine) {
            ingredientMap.set(id, mine.id);
          } else {
            const ingredient: Ingredient = { id: newId(), name, unit: null, custom: true };
            await repo.createIngredient(ingredient);
            created.push(ingredient);
            ingredientMap.set(id, ingredient.id);
          }
        }

        // Receitas: reaproveita cópias de subreceitas que você já salvou.
        const originals = [tree.root, ...Object.values(tree.subs)];
        const recipeMap = new Map<string, string>();
        for (const r of originals) recipeMap.set(r.id, findCopyOf(r.id)?.id ?? newId());

        const now = nowIso();
        const copies = originals
          .filter((r) => r.id === tree.root.id || !findCopyOf(r.id))
          .map(
            (r): Recipe => ({
              ...r,
              id: recipeMap.get(r.id)!,
              isPublic: false,
              originRecipeId: r.id,
              originAuthorName: tree.authorName,
              createdAt: now,
              updatedAt: now,
              items: r.items.map((i) => ({
                id: newId(),
                ingredientId: i.ingredientId ? ingredientMap.get(i.ingredientId) ?? i.ingredientId : null,
                subRecipeId: i.subRecipeId ? recipeMap.get(i.subRecipeId) ?? null : null,
                quantity: i.quantity,
                unit: i.unit,
              })),
            }),
          )
          // Subreceita que não veio na árvore (ex.: ficou privada) é descartada do item.
          .map((r) => ({ ...r, items: r.items.filter((i) => i.ingredientId || i.subRecipeId) }));

        for (const copy of dependencyOrder(copies)) await repo.saveRecipe(copy);

        setSnap((s) => ({ ...s, customIngredients: [...s.customIngredients, ...created], recipes: [...s.recipes, ...copies] }));
        return recipeMap.get(tree.root.id)!;
      } catch (e) {
        Alert.alert('Não foi possível salvar', (e as Error).message);
        repo.loadAll().then(setSnap, () => undefined);
        return null;
      }
    },
    [catalog, findCopyOf, repo],
  );

  const setHasIngredient = useCallback(
    (id: string, has: boolean) =>
      run(
        (s) => ({ ...s, pantryIngredientIds: has ? [...s.pantryIngredientIds.filter((i) => i !== id), id] : s.pantryIngredientIds.filter((i) => i !== id) }),
        () => repo.setPantryIngredient(id, has),
      ),
    [repo, run],
  );

  const setHasRecipe = useCallback(
    (id: string, has: boolean) =>
      run(
        (s) => ({ ...s, pantryRecipeIds: has ? [...s.pantryRecipeIds.filter((i) => i !== id), id] : s.pantryRecipeIds.filter((i) => i !== id) }),
        () => repo.setPantryRecipe(id, has),
      ),
    [repo, run],
  );

  const addMealPlan = useCallback(
    (date: string, recipeId: string) => {
      const plan: MealPlan = { id: newId(), date, recipeId };
      return run((s) => ({ ...s, mealPlans: [...s.mealPlans, plan] }), () => repo.addMealPlan(plan));
    },
    [repo, run],
  );

  const removeMealPlan = useCallback(
    (id: string) => run((s) => ({ ...s, mealPlans: s.mealPlans.filter((p) => p.id !== id) }), () => repo.removeMealPlan(id)),
    [repo, run],
  );

  const addExtra = useCallback(
    (weekStart: string, name: string, quantity: number | null, unit: string | null) => {
      const extra: ShoppingExtra = { id: newId(), weekStart, name: name.trim(), quantity, unit, purchased: false };
      return run((s) => ({ ...s, extras: [...s.extras, extra] }), () => repo.addExtra(extra));
    },
    [repo, run],
  );

  const setExtraPurchased = useCallback(
    (id: string, purchased: boolean) =>
      run((s) => ({ ...s, extras: s.extras.map((e) => (e.id === id ? { ...e, purchased } : e)) }), () => repo.updateExtra(id, { purchased })),
    [repo, run],
  );

  const deleteExtra = useCallback(
    (id: string) => run((s) => ({ ...s, extras: s.extras.filter((e) => e.id !== id) }), () => repo.deleteExtra(id)),
    [repo, run],
  );

  const value: DataState = {
    ready: loadedKey === key,
    initialized: loadedKey !== null,
    status,
    error,
    reload: () => setReloadTick((t) => t + 1),
    isGuest: !userId,
    catalog,
    ingredientName,
    findIngredientByName,
    addIngredient,
    recipes,
    getRecipe,
    saveRecipe,
    deleteRecipe,
    findCopyOf,
    saveCopy,
    pantryIngredients,
    pantryRecipes,
    setHasIngredient,
    setHasRecipe,
    mealPlans: snap.mealPlans,
    addMealPlan,
    removeMealPlan,
    extras: snap.extras,
    addExtra,
    setExtraPurchased,
    deleteExtra,
    needsContext,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProvider');
  return ctx;
}
