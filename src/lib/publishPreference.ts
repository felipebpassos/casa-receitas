import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Última escolha de "publicar" feita ao cadastrar. Usada como padrão no próximo cadastro.
 * Fica só neste celular; sem histórico, o padrão é privado.
 */
const KEY = 'receitas-de-casa:last-publish:v1';

export async function loadLastPublish(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveLastPublish(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, value ? '1' : '0').catch(() => undefined);
}
