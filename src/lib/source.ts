// Origem das receitas (link do vídeo / post). Base para a futura importação
// automática de YouTube, Instagram, TikTok etc.

export type SourcePlatform = 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'pinterest' | 'site';

const PATTERNS: [SourcePlatform, RegExp][] = [
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/i],
  ['instagram', /(^|\.)instagram\.com$/i],
  ['tiktok', /(^|\.)tiktok\.com$/i],
  ['facebook', /(^|\.)(facebook\.com|fb\.watch)$/i],
  ['pinterest', /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i],
];

export const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  site: 'site',
};

export const PLATFORM_ICON: Record<SourcePlatform, 'logo-youtube' | 'logo-instagram' | 'logo-tiktok' | 'logo-facebook' | 'logo-pinterest' | 'link'> = {
  youtube: 'logo-youtube',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  facebook: 'logo-facebook',
  pinterest: 'logo-pinterest',
  site: 'link',
};

/** Normaliza o link e identifica a plataforma. Retorna null se não for uma URL http(s) válida. */
export function parseSource(raw: string): { url: string; platform: SourcePlatform } | null {
  let text = raw.trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (!url.hostname.includes('.')) return null;
    const platform = PATTERNS.find(([, re]) => re.test(url.hostname))?.[0] ?? 'site';
    return { url: url.toString(), platform };
  } catch {
    return null;
  }
}

export function platformOf(value: string | null): SourcePlatform {
  return value && value in PLATFORM_LABEL ? (value as SourcePlatform) : 'site';
}
