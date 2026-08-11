/**
 * Root error boundary. A release build shows a black screen on any uncaught
 * render error — this catches it and shows a recoverable screen (with the
 * error message so it can be reported) instead of a frozen void.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, RADIUS } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.center}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The last action couldn't be completed. Your data is safe — go back and try again.
          </Text>
          {this.state.error.message ? (
            <Text style={styles.detail} numberOfLines={4}>
              {this.state.error.message}
            </Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            onPress={this.reset}
          >
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconText: { fontSize: 24 },
  title: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  body: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: FONT.regular,
  },
  detail: {
    fontSize: 11,
    color: COLORS.textFaint,
    textAlign: 'center',
    fontFamily: FONT.regular,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  btn: {
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 26,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
