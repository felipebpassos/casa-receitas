/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRichText, sanitizeRichText } from '../richText.ts';

test('texto puro antigo: várias linhas viram lista numerada, uma linha vira parágrafo', () => {
  assert.equal(sanitizeRichText('Misture tudo.\n\n Asse por 40 min. '), '<ol><li>Misture tudo.</li><li>Asse por 40 min.</li></ol>');
  assert.equal(sanitizeRichText('Só misture.'), '<p>Só misture.</p>');
  assert.equal(sanitizeRichText('a < b & c'), '<p>a &lt; b &amp; c</p>');
});

test('vazio ou só tags vazias vira string vazia', () => {
  assert.equal(sanitizeRichText(''), '');
  assert.equal(sanitizeRichText(null), '');
  assert.equal(sanitizeRichText('<div><br></div><p> </p>'), '');
  assert.equal(sanitizeRichText('<ol><li><br></li></ol>'), '');
});

test('HTML do contentEditable: divs viram parágrafos, mantém negrito/itálico e listas', () => {
  const html = 'Primeiro <b>passo</b><div><i>segundo</i>&nbsp;passo</div><div><br></div><ol><li>um</li><li><strong>dois</strong></li></ol><ul><li>x</li></ul>';
  assert.equal(
    sanitizeRichText(html),
    '<p>Primeiro <b>passo</b></p><p><i>segundo</i> passo</p><ol><li>um</li><li><b>dois</b></li></ol><ul><li>x</li></ul>',
  );
});

test('remove atributos, tags não permitidas e scripts', () => {
  const html = '<p style="color:red" onclick="x()">Oi <span class="a">mundo</span> <a href="http://x">link</a></p><script>alert(1)</script><img src=x onerror=alert(1)>';
  assert.equal(sanitizeRichText(html), '<p>Oi mundo link</p>');
});

test('é idempotente', () => {
  const once = sanitizeRichText('<div><b>A</b> <i>b</i></div><ul><li>1<br>2</li></ul>');
  assert.equal(sanitizeRichText(once), once);
});

test('listas aninhadas são achatadas e quebras dentro do item são mantidas', () => {
  const blocks = parseRichText('<ol><li>a<ol><li>b</li></ol></li><li>c<br>d</li></ol>');
  assert.deepEqual(blocks, [
    {
      type: 'ol',
      items: [
        [{ text: 'a', bold: false, italic: false }],
        [{ text: 'b', bold: false, italic: false }],
        [{ text: 'c\nd', bold: false, italic: false }],
      ],
    },
  ]);
});
