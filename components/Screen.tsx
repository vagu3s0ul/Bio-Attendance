import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';

/**
 * App screen canvas. Tab screens have navigator headers that already handle
 * the top inset, so they should pass edges={[]}. Header-less screens (login)
 * keep the default ['top'].
 */
export default function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1 },
});
