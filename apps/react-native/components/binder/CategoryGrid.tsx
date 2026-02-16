// components/binder/CategoryGrid.tsx
// 3x3 grid of top-level category folders shown on the binder detail screen.
// Tapping a category navigates into that folder.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { getAllCategories, type Category } from '../../core/binder/categories';

interface CategoryGridProps {
  onSelectCategory: (category: Category) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  visits: '🩺',
  conditions: '❤️‍🩹',
  labs: '🧪',
  medications: '💊',
  immunizations: '💉',
  allergies: '⚠️',
  procedures: '🔬',
  imaging: '📷',
  documents: '📄',
  insurance: '🏥',
};

export function CategoryGrid({ onSelectCategory }: CategoryGridProps) {
  const categories = getAllCategories();
  const screenWidth = Dimensions.get('window').width;
  const cellSize = (screenWidth - 32 - 16) / 3; // 16px padding each side + 8px gap x 2

  return (
    <View style={styles.grid}>
      {categories.map((cat) => (
        <TouchableOpacity
          key={cat.slug}
          style={[styles.cell, { width: cellSize, height: cellSize }]}
          onPress={() => onSelectCategory(cat)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>
            {CATEGORY_ICONS[cat.slug] ?? '📁'}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {cat.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  cell: {
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#444',
    textAlign: 'center',
  },
});
