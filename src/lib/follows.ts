// Seguir pessoas. Seguidores de qualquer perfil são públicos (só o número);
// quem a pessoa segue e quem segue ela, só ela vê.
import { serviceError } from './errors';
import type { PublicPersonSummary } from './publicLibrary';
import { supabase } from './supabase';

export type FollowStats = {
  followers: number;
  /** Só vem no próprio perfil; null para os outros. */
  following: number | null;
  /** A pessoa logada segue este perfil. */
  isFollowing: boolean;
};

export type FollowListKind = 'followers' | 'following';

export async function getFollowStats(userId: string): Promise<FollowStats> {
  const { data, error, status } = await supabase.rpc('follow_stats', { p_user: userId });
  if (error) throw serviceError({ ...error, status });
  const row = (data as { followers_count: number; following_count: number | null; is_following: boolean }[])[0];
  return {
    followers: Number(row?.followers_count ?? 0),
    following: row?.following_count == null ? null : Number(row.following_count),
    isFollowing: !!row?.is_following,
  };
}

export async function follow(myId: string, userId: string): Promise<void> {
  const { error, status } = await supabase.from('follows').insert({ follower_id: myId, followee_id: userId });
  // Já seguia (toque duplo, outra aba): tudo bem.
  if (error && error.code !== '23505') throw serviceError({ ...error, status });
}

export async function unfollow(myId: string, userId: string): Promise<void> {
  const { error, status } = await supabase.from('follows').delete().eq('follower_id', myId).eq('followee_id', userId);
  if (error) throw serviceError({ ...error, status });
}

/** Listas da pessoa logada: quem segue ela ou quem ela segue. */
export async function listMyFollows(kind: FollowListKind): Promise<PublicPersonSummary[]> {
  const { data, error, status } = await supabase.rpc('list_my_follows', { p_kind: kind });
  if (error) throw serviceError({ ...error, status });
  return (data as { id: string; username: string | null; recipe_count: number }[]).map((p) => ({
    id: p.id,
    name: p.username,
    recipeCount: Number(p.recipe_count),
  }));
}
