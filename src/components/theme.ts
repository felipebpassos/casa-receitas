/** Paleta da logo: bege de fundo, laranja do telhado (primária), verde da panela (detalhes) e marrom do contorno (texto). */
export const colors = {
  primary: '#C8603A',
  primaryLight: '#F6E4D9',
  onPrimary: '#FFFFFF',
  /** Verde da panela da logo: só detalhe decorativo (ex.: subreceitas). Não usar como "sucesso". */
  olive: '#6F7048',
  oliveLight: '#E8E6D3',
  /** Sucesso / concluído (toast, check, itens comprados). */
  success: '#16A34A',
  successLight: '#DCFCE7',
  text: '#3D342E',
  muted: '#74685F',
  border: '#E5DCCB',
  background: '#F9F5EA',
  card: '#FFFDF8',
  surface: '#EFE8D9',
  /** Trilho do interruptor desligado (contraste ≥ 3:1 com o card). */
  toggleOff: '#9A8E82',
  danger: '#B3261E',
  dangerLight: '#F9E3DF',
  /** Avisos que não são culpa de ninguém (ex.: sem internet). */
  warning: '#8A5A12',
  warningLight: '#FBEBD0',
  /** "Falta comprar": mesmo laranja da marca. */
  accent: '#C8603A',
  accentLight: '#F6E4D9',
};

/** Lora (serifada, cara de caderno) nos títulos; texto corrido segue com a fonte do sistema. */
export const fonts = {
  serif: 'Lora_400Regular',
  serifMedium: 'Lora_500Medium',
  serifSemiBold: 'Lora_600SemiBold',
  serifBold: 'Lora_700Bold',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };
