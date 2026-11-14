import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { parseRichText, type RichSpan } from '@/lib/richText';
import { colors, spacing } from './theme';
import { styles } from './ui';

/** Renderiza o texto rico (HTML restrito) com componentes nativos, sem WebView. */
export function RichText({ value }: { value: string | null | undefined }) {
  const blocks = useMemo(() => parseRichText(value), [value]);
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, idx) =>
        block.type === 'p' ? (
          <Text key={idx} style={styles.body}>
            <Spans spans={block.spans} />
          </Text>
        ) : (
          <View key={idx} style={{ gap: spacing.md }}>
            {block.items.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
                {block.type === 'ol' ? (
                  <View style={local.stepNumber}>
                    <Text style={local.stepNumberText}>{i + 1}</Text>
                  </View>
                ) : (
                  <View style={local.bulletWrap}>
                    <View style={local.bullet} />
                  </View>
                )}
                <Text style={[styles.body, { flex: 1 }]}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

function Spans({ spans }: { spans: RichSpan[] }) {
  return spans.map((s, i) => (
    <Text key={i} style={[s.bold && { fontWeight: '700' }, s.italic && { fontStyle: 'italic' }]}>
      {s.text}
    </Text>
  ));
}

const local = StyleSheet.create({
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -1,
  },
  stepNumberText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  bulletWrap: { width: 24, height: 22, alignItems: 'center', justifyContent: 'center' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
