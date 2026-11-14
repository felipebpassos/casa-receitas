import { useCallback, useState } from 'react';
import RichTextEditor from './RichTextEditor';

/**
 * Campo de texto rico. No celular o editor roda numa WebView sem rolagem própria,
 * cuja altura acompanha o conteúdo (a rolagem fica com a tela).
 */
export function RichTextField({
  initialValue,
  onChange,
  placeholder,
  invalid,
}: {
  /** HTML inicial (já normalizado com `sanitizeRichText`). Mudanças depois de montar são ignoradas. */
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [height, setHeight] = useState(190);
  const handleChange = useCallback(async (html: string) => onChange(html), [onChange]);
  const handleHeight = useCallback(async (h: number) => setHeight((prev) => (h > 0 && h !== prev ? h : prev)), []);

  return (
    <RichTextEditor
      initialHtml={initialValue}
      placeholder={placeholder}
      invalid={invalid}
      onChange={handleChange}
      onHeight={handleHeight}
      dom={{ scrollEnabled: false, style: { height, backgroundColor: 'transparent' } }}
    />
  );
}
