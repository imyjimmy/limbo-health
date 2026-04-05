import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  getLegalDocument,
  type LegalDocumentId,
} from '../../core/legal/documents';
import {
  parseLegalMarkdown,
  tokenizeLegalInline,
  type LegalMarkdownBlock,
} from '../../core/legal/markdown';
import { createThemedStyles, useThemedStyles } from '../../theme';

type InlineStyle = TextStyle;

export function LegalDocumentScreen({
  documentId,
}: {
  documentId: LegalDocumentId;
}) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const document = getLegalDocument(documentId);
  const blocks = useMemo(() => parseLegalMarkdown(document.markdown), [document.markdown]);

  const handleLinkPress = useCallback(
    (href: string) => {
      if (href.startsWith('/')) {
        router.push(href as Href);
        return;
      }

      void Linking.openURL(href).catch(() => {
        Alert.alert('Unable to Open Link', 'Please try again in a moment.');
      });
    },
    [router],
  );

  const renderInline = useCallback(
    (text: string, baseStyle: InlineStyle, keyPrefix: string) =>
      tokenizeLegalInline(text).map((token, tokenIndex) => {
        const key = `${keyPrefix}-${tokenIndex}`;

        if (token.type === 'link') {
          return (
            <Text
              key={key}
              style={[baseStyle, styles.linkText]}
              onPress={() => handleLinkPress(token.href)}
            >
              {token.text}
            </Text>
          );
        }

        if (token.type === 'code') {
          return (
            <Text key={key} style={[baseStyle, styles.inlineCode]}>
              {token.text}
            </Text>
          );
        }

        return (
          <Text key={key} style={baseStyle}>
            {token.text}
          </Text>
        );
      }),
    [handleLinkPress, styles.inlineCode, styles.linkText],
  );

  const renderBlock = useCallback(
    (block: LegalMarkdownBlock, blockIndex: number) => {
      if (block.type === 'heading') {
        if (block.level === 1) {
          return (
            <Text key={`block-${blockIndex}`} style={styles.heading1}>
              {block.text}
            </Text>
          );
        }

        if (block.level === 2) {
          return (
            <Text key={`block-${blockIndex}`} style={styles.heading2}>
              {block.text}
            </Text>
          );
        }

        return (
          <Text key={`block-${blockIndex}`} style={styles.heading3}>
            {block.text}
          </Text>
        );
      }

      if (block.type === 'quote') {
        return (
          <View key={`block-${blockIndex}`} style={styles.quoteCard}>
            <Text style={styles.quoteText}>
              {renderInline(block.text, styles.quoteText, `quote-${blockIndex}`)}
            </Text>
          </View>
        );
      }

      if (block.type === 'list') {
        return (
          <View key={`block-${blockIndex}`} style={styles.listGroup}>
            {block.items.map((item, itemIndex) => (
              <View key={`list-${blockIndex}-${itemIndex}`} style={styles.listItemRow}>
                <Text style={styles.listBullet}>{'\u2022'}</Text>
                <View style={styles.listItemCopy}>
                  <Text style={styles.listItemText}>
                    {renderInline(item, styles.listItemText, `list-${blockIndex}-${itemIndex}`)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      }

      return (
        <Text key={`block-${blockIndex}`} style={styles.paragraph}>
          {renderInline(block.text, styles.paragraph, `paragraph-${blockIndex}`)}
        </Text>
      );
    },
    [
      renderInline,
      styles.heading1,
      styles.heading2,
      styles.heading3,
      styles.listBullet,
      styles.listGroup,
      styles.listItemRow,
      styles.listItemText,
      styles.paragraph,
      styles.quoteCard,
      styles.quoteText,
    ],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.card}>
        {blocks.map(renderBlock)}
      </View>
    </ScrollView>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSubtle,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  heading1: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 10,
  },
  heading2: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    marginTop: 24,
    marginBottom: 10,
  },
  heading3: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 18,
    marginBottom: 8,
  },
  paragraph: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 12,
  },
  quoteCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    borderRadius: 14,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quoteText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
  },
  listGroup: {
    gap: 10,
    marginBottom: 14,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  listItemCopy: {
    flex: 1,
  },
  listBullet: {
    color: theme.colors.primary,
    fontSize: 18,
    lineHeight: 22,
    marginTop: 1,
  },
  listItemText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  linkText: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  inlineCode: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 6,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
}));
