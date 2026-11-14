/**
 * Texto rico do modo de preparo: um HTML bem restrito (parágrafos, negrito, itálico e listas).
 *
 * O editor (contentEditable) gera HTML "sujo", que varia de navegador para navegador.
 * Aqui ele é convertido numa estrutura simples de blocos, usada tanto para renderizar
 * nativamente (sem WebView) quanto para salvar um HTML normalizado e seguro.
 *
 * Receitas antigas têm o preparo em texto puro (um passo por linha); elas continuam
 * funcionando: várias linhas viram uma lista numerada, uma linha vira um parágrafo.
 */

export type RichSpan = { text: string; bold: boolean; italic: boolean };
export type RichBlock = { type: 'p'; spans: RichSpan[] } | { type: 'ol' | 'ul'; items: RichSpan[][] };

const HTML_TAG = /<\/?(p|div|br|b|i|strong|em|ol|ul|li|span)\b[^>]*>/i;

/** Se o texto já é HTML (do editor) ou ainda é texto puro (receitas antigas). */
export const isRichHtml = (value: string) => HTML_TAG.test(value);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n === 0xa0 ? 32 : n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const hasText = (spans: RichSpan[]) => spans.some((s) => s.text.trim().length > 0);

/** Junta trechos vizinhos com a mesma formatação e apara espaços nas pontas. */
function tidy(spans: RichSpan[]): RichSpan[] {
  const out: RichSpan[] = [];
  for (const s of spans) {
    const text = s.text.replace(/[ \t\r\f\v]+/g, ' ');
    const last = out[out.length - 1];
    if (last && last.bold === s.bold && last.italic === s.italic) last.text += text;
    else out.push({ ...s, text });
  }
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    const end = out[out.length - 1];
    end.text = end.text.replace(/\s+$/, '');
  }
  return out.map((s) => ({ ...s, text: s.text.replace(/ ?\n ?/g, '\n') })).filter((s) => s.text.length > 0);
}

function parseHtml(html: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let para: RichSpan[] = [];
  let list: { type: 'ol' | 'ul'; items: RichSpan[][] } | null = null;
  let listDepth = 0;
  let li: RichSpan[] | null = null;
  let bold = 0;
  let italic = 0;
  let skip = 0; // dentro de <script>/<style>: descarta o conteúdo

  const flushPara = () => {
    if (hasText(para)) blocks.push({ type: 'p', spans: tidy(para) });
    para = [];
  };
  const flushLi = () => {
    if (li && list && hasText(li)) list.items.push(tidy(li));
    li = null;
  };
  const flushList = () => {
    flushLi();
    if (list && list.items.length) blocks.push(list);
    list = null;
    listDepth = 0;
  };

  const token = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>|<!--[\s\S]*?-->|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html))) {
    const [raw, closing, rawTag, text] = m;
    if (text !== undefined || raw === '<') {
      if (skip) continue;
      const value = decodeEntities(text ?? raw).replace(/\n/g, ' ');
      if (list && !li) {
        if (!value.trim()) continue;
        li = []; // texto solto dentro da lista vira um item
      }
      (li ?? para).push({ text: value, bold: bold > 0, italic: italic > 0 });
      continue;
    }
    if (!rawTag) continue; // comentário
    const tag = rawTag.toLowerCase();
    const open = !closing;

    if (tag === 'script' || tag === 'style') {
      skip = Math.max(0, skip + (open ? 1 : -1));
      continue;
    }
    if (skip) continue;

    switch (tag) {
      case 'b':
      case 'strong':
        bold = Math.max(0, bold + (open ? 1 : -1));
        break;
      case 'i':
      case 'em':
        italic = Math.max(0, italic + (open ? 1 : -1));
        break;
      case 'br':
        if (li) li.push({ text: '\n', bold: false, italic: false });
        else if (list) flushLi();
        else flushPara();
        break;
      case 'p':
      case 'div':
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
      case 'blockquote':
        if (li) {
          if (hasText(li)) li.push({ text: '\n', bold: false, italic: false });
        } else if (!list) flushPara();
        break;
      case 'ol':
      case 'ul':
        if (open) {
          if (!list) {
            flushPara();
            list = { type: tag, items: [] };
          } else flushLi(); // lista aninhada: achata na de fora
          listDepth++;
        } else if (list) {
          flushLi();
          listDepth--;
          if (listDepth <= 0) flushList();
        }
        break;
      case 'li':
        if (open) {
          if (!list) {
            flushPara();
            list = { type: 'ul', items: [] };
            listDepth = 1;
          }
          flushLi();
          li = [];
        } else flushLi();
        break;
      default:
        // Demais tags (span, font, a...) são removidas, mas o texto fica.
        break;
    }
  }
  flushList();
  flushPara();
  return blocks;
}

function plainToBlocks(text: string): RichBlock[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l): RichSpan[] => [{ text: l, bold: false, italic: false }]);
  if (lines.length === 0) return [];
  if (lines.length === 1) return [{ type: 'p', spans: lines[0] }];
  return [{ type: 'ol', items: lines }];
}

/** Converte o preparo (HTML ou texto puro antigo) em blocos. */
export function parseRichText(value: string | null | undefined): RichBlock[] {
  if (!value?.trim()) return [];
  return isRichHtml(value) ? parseHtml(value) : plainToBlocks(value);
}

function spansToHtml(spans: RichSpan[]): string {
  return spans
    .map((s) => {
      let out = escapeHtml(s.text).replace(/\n/g, '<br>');
      if (s.italic) out = `<i>${out}</i>`;
      if (s.bold) out = `<b>${out}</b>`;
      return out;
    })
    .join('');
}

export function blocksToHtml(blocks: RichBlock[]): string {
  return blocks
    .map((b) => (b.type === 'p' ? `<p>${spansToHtml(b.spans)}</p>` : `<${b.type}>${b.items.map((i) => `<li>${spansToHtml(i)}</li>`).join('')}</${b.type}>`))
    .join('');
}

/**
 * HTML normalizado (só as tags permitidas, sem atributos). Vazio vira ''.
 * Também serve para abrir receitas antigas (texto puro) no editor.
 */
export const sanitizeRichText = (value: string | null | undefined): string => blocksToHtml(parseRichText(value));
