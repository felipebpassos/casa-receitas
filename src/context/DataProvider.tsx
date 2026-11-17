import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from '@/components/Toast';
import { fetchRemoteCatalog, GLOBAL_CATALOG, loadCachedCatalog, suggestIngredient as sendSuggestion } from '@/lib/catalog';
import { UserFacingError } from '@/lib/errors';
import { newId, nowIso } from '@/lib/ids';
import { fetchIsAdmin } from '@/lib/publicLibrary';
import { localRepo } from '@/lib/repo/localRepo';
import { dependencyOrder, migrateLocalToRemote } from '@/lib/repo/migrate';
import { RemoteRepo } from '@/lib/repo/remoteRepo';
import type { Repo } from '@/lib/repo/types';
import { parentsOf, type NeedsContext } from '@/lib/shopping';
import {
  emptySnapshot,
  type Ingredient,
  type MealPlan,
  type PublicRecipeTree,
  type Recipe,
  type Snapshot,
} from '@/lib/types';
import { useAuth } from './AuthProvider';

type DataState = {
  /** Dados do modo atual (celular/conta) carregados. */
  ready: boolean;
  /** Já carregou alguma vez desde que o app abriu. */
  initialized: boolean;
  /** Mensagem exibida enquanto carrega (ex.: migração para a conta). */
  status: string | null;
  /** Falha ao carregar os dados (erro bruto; use toAppError/ErrorView para exibir). */
  error: unknown;
  /** Recarregando após um "tentar de novo". */
  reloading: boolean;
  reload: () => void;
  isGuest: boolean;
  /** Administrador: o que publica já aparece na busca do Explorar. */
  isAdmin: boolean;

  /** Catálogo global de ingredientes (o único permitido nas receitas). */
  catalog: Ingredient[];
  getIngredient: (id: string) => Ingredient | undefined;
  ingredientName: (id: string) => string;
  /** Envia para moderação um ingrediente que falta no catálogo. Exige login. */
  suggestIngredient: (name: string, unit: string | null, note: string | null) => Promise<boolean>;

  recipes: Recipe[];
  getRecipe: (id: string) => Recipe | undefined;
  saveRecipe: (recipe: Recipe) => Promise<boolean>;
  deleteRecipe: (id: string) => Promise<boolean>;
  findCopyOf: (publicRecipeId: string) => Recipe | undefined;
  saveCopy: (tree: PublicRecipeTree) => Promise<string | null>;

  mealPlans: MealPlan[];
  addMealPlan: (date: string, recipeId: string) => Promise<boolean>;
  removeMealPlan: (id: string) => Promise<boolean>;

  /** Contexto de cálculo da lista de compras para as receitas da coleção. */
  needsContext: NeedsContext;
};

const DataContext = createContext<DataState | null>(null);

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');

export function DataProvider({ children }: { children: ReactNode }) {
  const { userId, loading: authLoading } = useAuth();
  const key = userId ?? 'local';
  const repo: Repo = useMemo(() => (userId ? new RemoteRepo(userId) : localRepo), [userId]);

  const [snap, setSnap] = useState<Snapshot>(emptySnapshot);
  const [rawCatalog, setRawCatalog] = useState<Ingredient[]>(GLOBAL_CATALOG);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // Papel de admin: lido do perfil; na falha, segue como usuário comum (o servidor é quem garante).
  const [adminOf, setAdminOf] = useState<string | null>(null);
  const isAdmin = !!userId && adminOf === userId;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchIsAdmin(userId).then((v) => !cancelled && setAdminOf(v ? userId : null));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Catálogo: o do cache na hora; o atualizado do servidor quando chegar (offline, fica o do cache).
  useEffect(() => {
    let cancelled = false;
    loadCachedCatalog().then((c) => !cancelled && setRawCatalog(c));
    fetchRemoteCatalog().then(
      (c) => !cancelled && c?.length && setRawCatalog(c),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

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
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) {
          setStatus(null);
          setReloading(false);
          setLoadedKey(key);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, key, authLoading, reloadTick]);

  // ---------------------------------------------------------------- derivados
  const catalog = useMemo(() => [...rawCatalog].sort(byName), [rawCatalog]);
  const ingredientById = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const recipeById = useMemo(() => new Map(snap.recipes.map((r) => [r.id, r])), [snap.recipes]);
  const recipes = useMemo(() => [...snap.recipes].sort(byName), [snap.recipes]);

  const getIngredient = useCallback((id: string) => ingredientById.get(id), [ingredientById]);
  const ingredientName = useCallback((id: string) => ingredientById.get(id)?.name ?? 'Ingrediente', [ingredientById]);
  const getRecipe = useCallback((id: string) => recipeById.get(id), [recipeById]);
  const findCopyOf = useCallback((publicId: string) => snap.recipes.find((r) => r.originRecipeId === publicId), [snap.recipes]);

  const needsContext = useMemo<NeedsContext>(() => ({ getRecipe: (id) => recipeById.get(id), ingredientName }), [recipeById, ingredientName]);

  // ----------------------------------------------------------------- mutações
  /** Aplica a mudança na tela na hora e grava; se falhar, avisa e recarrega do armazenamento. */
  const run = useCallback(
    async (optimistic: (s: Snapshot) => Snapshot, action: () => Promise<void>): Promise<boolean> => {
      setSnap(optimistic);
      try {
        await action();
        return true;
      } catch (e) {
        toast.error(e, { title: 'Não foi possível salvar' });
        repo.loadAll().then(setSnap, () => undefined);
        return false;
      }
    },
    [repo],
  );

  const suggestIngredient = useCallback(
    async (name: string, unit: string | null, note: string | null) => {
      if (!userId) {
        toast.error(new UserFacingError('Entre na sua conta para sugerir ingredientes.', 'Faça login'));
        return false;
      }
      try {
        await sendSuggestion({ name: name.trim(), unit, note: note?.trim() || null });
        return true;
      } catch (e) {
        toast.error(e, { title: 'Não foi possível enviar a sugestão' });
        return false;
      }
    },
    [userId],
  );

  const saveRecipe = useCallback(
    async (recipe: Recipe) => {
      // Sem login nada é público. Aparecer na busca (listed) é decidido pelo servidor:
      // admin publica já listada; privada nunca fica listada.
      const isPublic = !!userId && !recipe.originRecipeId && recipe.visibility === 'PUBLIC';
      const toSave: Recipe = {
        ...recipe,
        visibility: isPublic ? 'PUBLIC' : 'PRIVATE',
        listed: isPublic && (isAdmin || recipe.listed),
        updatedAt: nowIso(),
      };
      const submitted = isPublic;
      const ok = await run(
        (s) => {
          const exists = s.recipes.some((r) => r.id === toSave.id);
          return { ...s, recipes: exists ? s.recipes.map((r) => (r.id === toSave.id ? toSave : r)) : [...s.recipes, toSave] };
        },
        () => repo.saveRecipe(toSave),
      );
      // Ao publicar, o servidor também publica os preparos usados: recarrega para refletir.
      if (ok && submitted && toSave.items.some((i) => i.subRecipeId)) repo.loadAll().then(setSnap, () => undefined);
      return ok;
    },
    [repo, run, userId, isAdmin],
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      const parents = parentsOf(snap.recipes, id);
      if (parents.length) {
        toast.error(
          new UserFacingError(`Este preparo é usado em: ${parents.map((p) => p.name).join(', ')}. Remova-o dessas receitas primeiro.`, 'Não é possível excluir', 'conflict'),
        );
        return false;
      }
      return run(
        (s) => ({
          ...s,
          recipes: s.recipes.filter((r) => r.id !== id),
          mealPlans: s.mealPlans.filter((p) => p.recipeId !== id),
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
        // Receitas: reaproveita cópias de subreceitas que você já salvou. Ingredientes são do catálogo (mesmo ID).
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
              // O que é usado dentro da receita entra no caderno como preparo.
              kind: r.id === tree.root.id ? r.kind : 'PREP',
              visibility: 'PRIVATE',
              listed: false,
              originRecipeId: r.id,
              originAuthorName: tree.authorName,
              createdAt: now,
              updatedAt: now,
              items: r.items.map((i) => ({
                id: newId(),
                ingredientId: i.ingredientId,
                subRecipeId: i.subRecipeId ? recipeMap.get(i.subRecipeId) ?? null : null,
                quantity: i.quantity,
                unit: i.unit,
              })),
            }),
          )
          // Subreceita que não veio na árvore (ex.: deixou de ser pública) é descartada do item.
          .map((r) => ({ ...r, items: r.items.filter((i) => i.ingredientId || i.subRecipeId) }));

        for (const copy of dependencyOrder(copies)) await repo.saveRecipe(copy);

        setSnap((s) => ({ ...s, recipes: [...s.recipes, ...copies] }));
        return recipeMap.get(tree.root.id)!;
      } catch (e) {
        toast.error(e, { title: 'Não foi possível salvar a receita' });
        repo.loadAll().then(setSnap, () => undefined);
        return null;
      }
    },
    [findCopyOf, repo],
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

  const value: DataState = {
    ready: loadedKey === key,
    initialized: loadedKey !== null,
    status,
    error,
    reloading,
    reload: () => {
      setReloading(true);
      setReloadTick((t) => t + 1);
    },
    isGuest: !userId,
    isAdmin,
    catalog,
    getIngredient,
    ingredientName,
    suggestIngredient,
    recipes,
    getRecipe,
    saveRecipe,
    deleteRecipe,
    findCopyOf,
    saveCopy,
    mealPlans: snap.mealPlans,
    addMealPlan,
    removeMealPlan,
    needsContext,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProvider');
  return ctx;
}
