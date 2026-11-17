// Nome de usuário: disponibilidade e troca.
import { serviceError, UserFacingError } from './errors';
import { supabase } from './supabase';
import { normalizeUsername } from './validation';

export const USERNAME_TAKEN = 'Esse nome de usuário já está em uso.';

export async function isUsernameAvailable(u: string): Promise<boolean> {
  const { data, error, status } = await supabase.rpc('username_available', { u: normalizeUsername(u) });
  if (error) throw serviceError({ ...error, status });
  return data === true;
}

/** Grava e confirma o usuário da pessoa logada. Devolve o valor salvo. */
export async function setUsername(u: string): Promise<string> {
  const { data, error, status } = await supabase.rpc('set_username', { u: normalizeUsername(u) });
  if (error) {
    if (error.code === '23505') throw new UserFacingError(USERNAME_TAKEN, 'Usuário em uso', 'conflict');
    if (error.code === '22023') throw new UserFacingError(error.message, 'Usuário inválido');
    throw serviceError({ ...error, status });
  }
  return data as string;
}
