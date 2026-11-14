'use dom';

/**
 * Editor de texto rico (DOM component): no celular roda numa WebView, na web é um componente comum.
 * Só oferece negrito, itálico e listas; o HTML gerado é normalizado em `sanitizeRichText` ao salvar.
 * Use pelo wrapper nativo `RichTextField`, que cuida da altura.
 */
import { IS_DOM, type DOMProps } from 'expo/dom';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { colors } from './theme';

type Command = 'bold' | 'italic' | 'insertOrderedList' | 'insertUnorderedList';

const NO_ACTIVE: Record<Command, boolean> = { bold: false, italic: false, insertOrderedList: false, insertUnorderedList: false };

type Props = {
  initialHtml: string;
  placeholder?: string;
  invalid?: boolean;
  onChange: (html: string) => Promise<void> | void;
  /** Altura do editor, para a WebView acompanhar o conteúdo. */
  onHeight?: (height: number) => Promise<void> | void;
  dom?: DOMProps;
};

export default function RichTextEditor({ initialHtml, placeholder, invalid, onChange, onHeight }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const loaded = useRef(false);
  const [active, setActive] = useState(NO_ACTIVE);
  const [empty, setEmpty] = useState(!initialHtml);
  const [focused, setFocused] = useState(false);

  // Conteúdo inicial só uma vez: depois o DOM é a fonte da verdade (senão o cursor pula).
  useEffect(() => {
    const el = editorRef.current;
    if (!el || loaded.current) return;
    loaded.current = true;
    el.innerHTML = initialHtml;
    setEmpty(isEmpty(el));
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // navegador sem suporte: segue com <div>, que também é aceito
    }
  }, [initialHtml]);

  // Dentro da WebView, o documento é só o editor.
  useEffect(() => {
    if (!IS_DOM) return;
    document.body.style.margin = '0';
    document.body.style.background = colors.background;
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onHeight || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => onHeight(Math.ceil(root.getBoundingClientRect().height)));
    observer.observe(root);
    return () => observer.disconnect();
  }, [onHeight]);

  // Acompanha a seleção: guarda a posição do cursor e o estado dos botões.
  useEffect(() => {
    const onSelection = () => {
      const el = editorRef.current;
      const sel = document.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
      savedRange.current = sel.getRangeAt(0).cloneRange();
      setActive(readActive());
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    setEmpty(isEmpty(el));
    onChange(el.innerHTML);
  };

  const run = (command: Command) => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      el.focus();
      const sel = document.getSelection();
      if (sel && savedRange.current) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
    }
    document.execCommand(command, false);
    setActive(readActive());
    emit();
  };

  const borderColor = invalid ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <div ref={rootRef} style={{ ...css.box, borderColor, backgroundColor: invalid ? '#FFF8F6' : colors.card }}>
      <style>{EDITOR_CSS}</style>
      <div style={css.toolbar} role="toolbar" aria-label="Formatação">
        <ToolButton label="Negrito" active={active.bold} onPress={() => run('bold')}>
          <span style={{ fontWeight: 800, fontSize: 17, fontFamily: 'Georgia, serif' }}>B</span>
        </ToolButton>
        <ToolButton label="Itálico" active={active.italic} onPress={() => run('italic')}>
          <span style={{ fontStyle: 'italic', fontSize: 18, fontFamily: 'Georgia, serif' }}>I</span>
        </ToolButton>
        <div style={css.divider} />
        <ToolButton label="Lista numerada" active={active.insertOrderedList} onPress={() => run('insertOrderedList')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </ToolButton>
        <ToolButton label="Lista com marcadores" active={active.insertUnorderedList} onPress={() => run('insertUnorderedList')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 6h12M9 12h12M9 18h12" />
            <circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none" />
          </svg>
        </ToolButton>
      </div>
      <div style={{ position: 'relative' }}>
        {empty && placeholder ? (
          <div style={css.placeholder} aria-hidden>
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          className="rte-content"
          contentEditable
          role="textbox"
          aria-multiline
          aria-label={placeholder ?? 'Texto'}
          aria-invalid={invalid}
          style={css.editor}
          onInput={emit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(e) => {
            // Cola só o texto, sem a formatação de outros sites.
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          }}
        />
      </div>
    </div>
  );
}

function ToolButton({ label, active, onPress, children }: { label: string; active: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Não tira o foco do texto ao tocar no botão.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      style={{
        ...css.button,
        backgroundColor: active ? colors.primaryLight : 'transparent',
        color: active ? colors.primary : colors.text,
      }}
    >
      {children}
    </button>
  );
}

const isEmpty = (el: HTMLElement) => !el.textContent?.trim() && !el.querySelector('li');

function readActive(): Record<Command, boolean> {
  const state = (c: Command) => {
    try {
      return document.queryCommandState(c);
    } catch {
      return false;
    }
  };
  return { bold: state('bold'), italic: state('italic'), insertOrderedList: state('insertOrderedList'), insertUnorderedList: state('insertUnorderedList') };
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Estilos do conteúdo editável (escopados na classe, para não vazar na web). */
const EDITOR_CSS = `
.rte-content { outline: none; }
.rte-content p, .rte-content div { margin: 0 0 8px; }
.rte-content ol, .rte-content ul { margin: 0 0 8px; padding-left: 24px; }
.rte-content li { margin-bottom: 4px; }
.rte-content li::marker { color: ${colors.primary}; font-weight: 700; }
.rte-content > :last-child { margin-bottom: 0; }
`;

const css: Record<string, CSSProperties> = {
  box: {
    boxSizing: 'border-box',
    width: '100%',
    border: '1px solid',
    borderRadius: 10,
    overflow: 'hidden',
    fontFamily: FONT,
    WebkitTapHighlightColor: 'transparent',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.background,
  },
  divider: { width: 1, height: 22, backgroundColor: colors.border, margin: '0 4px' },
  button: {
    width: 38,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 6,
    padding: 0,
    cursor: 'pointer',
    fontFamily: FONT,
  },
  editor: {
    minHeight: 140,
    padding: '10px 12px',
    fontSize: 16,
    lineHeight: '23px',
    color: colors.text,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    WebkitUserSelect: 'text',
    userSelect: 'text',
  },
  placeholder: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    fontSize: 16,
    lineHeight: '23px',
    color: colors.muted,
    pointerEvents: 'none',
  },
};
