// Classificação de erros: transforma qualquer falha (rede, Supabase, auth, código) em uma
// mensagem amigável e consistente. Módulo puro (sem React Native) para poder ser testado.

export type ErrorKind =
  | 'offline'
  | 'timeout'
  | 'credentials'
  | 'session'
  | 'permission'
  | 'notFound'
  | 'conflict'
  | 'rateLimit'
  | 'validation'
  | 'server'
  | 'unknown';

export type AppError = {
  kind: ErrorKind;
  /** Título curto (ex.: "Sem conexão"). */
  title: string;
  /** Explicação para a pessoa, em português. */
  message: string;
  /** Mensagem técnica original, para o "ver detalhes". */
  detail: string | null;
  /** Vale a pena oferecer "Tentar de novo". */
  retryable: boolean;
};

/** Erro cuja mensagem já foi escrita para a pessoa e deve aparecer como está. */
export class UserFacingError extends Error {
  readonly title: string | undefined;
  readonly kind: ErrorKind;
  constructor(message: string, title?: string, kind: ErrorKind = 'validation') {
    super(message);
    this.name = 'UserFacingError';
    this.title = title;
    this.kind = kind;
  }
}

/** Erro vindo do Supabase (PostgREST/Auth), preservando código e status HTTP. */
export class ServiceError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  constructor(source: { message: string; code?: string | null; status?: number | null }) {
    super(source.message);
    this.name = 'ServiceError';
    this.code = source.code ?? null;
    this.status = source.status ?? null;
  }
}

/** Converte o `error` de uma resposta do Supabase em ServiceError (para `throw`). */
export function serviceError(error: { message: string; code?: string | null; status?: number | null }): ServiceError {
  return new ServiceError(error);
}

const PRESETS: Record<ErrorKind, { title: string; message: string; retryable: boolean }> = {
  offline: {
    title: 'Sem conexão',
    message: 'Não foi possível falar com o servidor. Verifique sua internet e tente de novo.',
    retryable: true,
  },
  timeout: {
    title: 'Demorou demais',
    message: 'O servidor não respondeu a tempo. Tente de novo em instantes.',
    retryable: true,
  },
  credentials: {
    title: 'Não foi possível entrar',
    message: 'E-mail ou senha incorretos.',
    retryable: false,
  },
  session: {
    title: 'Sessão expirada',
    message: 'Sua sessão expirou. Entre na sua conta de novo para continuar.',
    retryable: false,
  },
  permission: {
    title: 'Acesso negado',
    message: 'Você não tem permissão para fazer isso.',
    retryable: false,
  },
  notFound: {
    title: 'Não encontrado',
    message: 'O que você procura não existe mais ou foi removido.',
    retryable: false,
  },
  conflict: {
    title: 'Já existe',
    message: 'Já existe um registro com esses dados.',
    retryable: false,
  },
  rateLimit: {
    title: 'Muitas tentativas',
    message: 'Você fez muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    retryable: true,
  },
  validation: {
    title: 'Confira os dados',
    message: 'Alguma informação está inválida.',
    retryable: false,
  },
  server: {
    title: 'Servidor indisponível',
    message: 'O servidor está com problemas no momento. Tente de novo daqui a pouco.',
    retryable: true,
  },
  unknown: {
    title: 'Algo deu errado',
    message: 'Ocorreu um erro inesperado. Tente de novo.',
    retryable: true,
  },
};

/** Mensagens específicas de autenticação do Supabase (por código ou trecho da mensagem). */
const AUTH_MESSAGES: { match: RegExp; kind: ErrorKind; message: string; title?: string }[] = [
  { match: /invalid_credentials|invalid login credentials/i, kind: 'credentials', message: 'E-mail ou senha incorretos.' },
  { match: /email_not_confirmed|email not confirmed/i, kind: 'credentials', title: 'Confirme seu e-mail', message: 'Abra o link que enviamos para o seu e-mail antes de entrar.' },
  { match: /user_already_exists|already registered|email_exists/i, kind: 'conflict', title: 'Conta já existe', message: 'Já existe uma conta com este e-mail. Tente entrar.' },
  { match: /weak_password|password should be/i, kind: 'validation', title: 'Senha fraca', message: 'Escolha uma senha mais forte, com pelo menos 6 caracteres.' },
  { match: /email_address_invalid|invalid email|unable to validate email/i, kind: 'validation', title: 'E-mail inválido', message: 'Confira se o e-mail foi digitado corretamente.' },
  { match: /signup_disabled|signups not allowed/i, kind: 'permission', title: 'Cadastro desativado', message: 'No momento não é possível criar novas contas.' },
  { match: /access_denied|access denied/i, kind: 'permission', title: 'Login cancelado', message: 'O acesso à sua conta não foi autorizado. Tente de novo se quiser entrar.' },
  { match: /provider is not enabled|unsupported provider/i, kind: 'server', title: 'Login indisponível', message: 'Esse tipo de login não está disponível no momento.' },
];

const OFFLINE = /network request failed|failed to fetch|fetch failed|networkerror|load failed|network error|internet connection|err_internet_disconnected|econnrefused|enotfound|authretryablefetcherror/i;
const TIMEOUT = /timeout|timed out|aborterror|the operation was aborted/i;
const SESSION = /jwt expired|invalid jwt|refresh token|session.*(expired|missing|not found)|pgrst30[13]/i;
const PERMISSION = /permission denied|row-level security|not authorized|forbidden|42501/i;
const RATE = /rate limit|too many requests|over_.*_rate_limit/i;

function rawMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

function field<T>(e: unknown, key: string): T | null {
  if (e && typeof e === 'object' && key in e) return ((e as Record<string, unknown>)[key] as T) ?? null;
  return null;
}

function classify(e: unknown): { kind: ErrorKind; title?: string; message?: string } {
  if (e instanceof UserFacingError) return { kind: e.kind, title: e.title, message: e.message };

  const msg = rawMessage(e);
  const code = String(field<string>(e, 'code') ?? '');
  const status = Number(field<number>(e, 'status') ?? 0);
  const name = String(field<string>(e, 'name') ?? '');
  const haystack = `${name} ${code} ${msg}`;

  if (OFFLINE.test(haystack)) return { kind: 'offline' };
  if (TIMEOUT.test(haystack) || status === 408 || status === 504) return { kind: 'timeout' };

  for (const a of AUTH_MESSAGES) if (a.match.test(haystack)) return { kind: a.kind, title: a.title, message: a.message };

  if (RATE.test(haystack) || status === 429) return { kind: 'rateLimit' };
  if (SESSION.test(haystack) || status === 401) return { kind: 'session' };
  if (PERMISSION.test(haystack) || status === 403) return { kind: 'permission' };
  if (code === 'PGRST116' || status === 404) return { kind: 'notFound' };
  if (code === '23505' || status === 409) return { kind: 'conflict' };
  if (code === '23503') return { kind: 'conflict', title: 'Em uso', message: 'Este item está sendo usado em outro lugar e não pode ser alterado.' };
  if (status >= 500) return { kind: 'server' };
  return { kind: 'unknown' };
}

export type ErrorContext = {
  /** O que a pessoa tentava fazer (ex.: "Não foi possível salvar"). Substitui o título genérico. */
  title?: string;
  /** Mensagem usada só quando o erro não é reconhecido. */
  message?: string;
};

/**
 * Normaliza qualquer erro em um AppError com título e mensagem amigáveis.
 * Com `context`, o título descreve a ação e a mensagem explica o motivo:
 * "Não foi possível salvar" + "Não foi possível falar com o servidor...".
 */
export function toAppError(e: unknown, context?: ErrorContext): AppError {
  if (isAppError(e)) return context?.title ? { ...e, title: context.title } : e;
  const c = classify(e);
  const preset = PRESETS[c.kind];
  const raw = rawMessage(e).trim();
  return {
    kind: c.kind,
    title: c.title ?? context?.title ?? preset.title,
    message: c.message ?? (c.kind === 'unknown' ? context?.message : undefined) ?? preset.message,
    detail: raw && raw !== c.message ? raw : null,
    retryable: preset.retryable,
  };
}

export function isAppError(e: unknown): e is AppError {
  return !!e && typeof e === 'object' && 'kind' in e && 'title' in e && 'retryable' in e && !(e instanceof Error);
}

export function isOfflineError(e: unknown): boolean {
  return toAppError(e).kind === 'offline';
}
