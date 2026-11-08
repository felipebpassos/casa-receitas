import { randomUUID } from 'expo-crypto';

/** IDs são gerados no app (UUID), assim os dados locais vão para a conta com os mesmos IDs. */
export const newId = (): string => randomUUID();

export const nowIso = (): string => new Date().toISOString();
