import { View, StyleSheet, Animated, Pressable } from 'react-native';
import { Text, Button, useTheme, type MD3Theme } from 'react-native-paper';
import { useEffect, useRef } from 'react';

interface Phase {
  id: string;
  title: string;
}

interface DrillProgressBarProps {
  phases: Phase[];
  completedPhaseIds: Set<string>;
  recentlyCompletedPhaseId: string | null;
  onAnimationComplete?: () => void;
  allPhasesComplete?: boolean;
  onPress?: () => void;
}

export function DrillProgressBar({
  phases,
  completedPhaseIds,
  recentlyCompletedPhaseId,
  onAnimationComplete,
  allPhasesComplete,
  onPress,
}: DrillProgressBarProps) {
  const theme = useTheme();

  // Find the recently completed phase for the notification pill
  const recentlyCompletedPhase = recentlyCompletedPhaseId
    ? phases.find((p) => p.id === recentlyCompletedPhaseId)
    : null;

  const content = (
    <>
      <View style={styles.progressRow}>
        {phases.map((phase, index) => {
          const isCompleted = completedPhaseIds.has(phase.id);
          const isRecentlyCompleted = recentlyCompletedPhaseId === phase.id;
          const isLast = index === phases.length - 1;
          const phaseNumber = index + 1;

          return (
            <View key={phase.id} style={[styles.phaseContainer, isLast && styles.lastPhaseContainer]}>
              <View style={[styles.indicatorRow, isLast && styles.lastIndicatorRow]}>
                <PhaseIndicator
                  phaseNumber={phaseNumber}
                  isCompleted={isCompleted}
                  isRecentlyCompleted={isRecentlyCompleted}
                  theme={theme}
                />
                {!isLast && (
                  <View
                    style={[
                      styles.connector,
                      {
                        backgroundColor: isCompleted
                          ? theme.colors.primary
                          : theme.colors.outlineVariant,
                      },
                    ]}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Completion notification pill */}
      {recentlyCompletedPhase && (
        <CompletionPill
          phaseTitle={recentlyCompletedPhase.title}
          onAnimationComplete={onAnimationComplete}
          theme={theme}
        />
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      {content}
    </View>
  );
}

interface PhaseIndicatorProps {
  phaseNumber: number;
  isCompleted: boolean;
  isRecentlyCompleted: boolean;
  theme: MD3Theme;
}

function PhaseIndicator({
  phaseNumber,
  isCompleted,
  isRecentlyCompleted,
  theme,
}: PhaseIndicatorProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecentlyCompleted) {
      // Pulse animation: scale up, then back down with a glow effect
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.3,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [isRecentlyCompleted, scaleAnim, glowAnim]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  return (
    <View style={styles.indicatorWrapper}>
      {/* Glow effect behind the indicator */}
      <Animated.View
        style={[
          styles.glow,
          {
            backgroundColor: theme.colors.primary,
            opacity: glowOpacity,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: isCompleted
              ? theme.colors.primary
              : theme.colors.surface,
            borderColor: isCompleted
              ? theme.colors.primary
              : theme.colors.outlineVariant,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text
          style={[
            styles.phaseNumber,
            {
              color: isCompleted
                ? theme.colors.onPrimary
                : theme.colors.onSurfaceVariant,
            },
          ]}
        >
          {phaseNumber}
        </Text>
      </Animated.View>
    </View>
  );
}

interface CompletionPillProps {
  phaseTitle: string;
  onAnimationComplete?: () => void;
  theme: MD3Theme;
}

function CompletionPill({
  phaseTitle,
  onAnimationComplete,
  theme,
}: CompletionPillProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    // Fade in, hold, then fade out
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1500),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onAnimationComplete?.();
    });
  }, [opacity, translateY, onAnimationComplete]);

  return (
    <Animated.View
      style={[
        styles.completionPill,
        {
          backgroundColor: theme.colors.primaryContainer,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text style={[styles.completionCheck, { color: theme.colors.primary }]}>
        ✓
      </Text>
      <Text
        style={[styles.completionText, { color: theme.colors.onPrimaryContainer }]}
        numberOfLines={1}
      >
        {phaseTitle}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseContainer: {
    flex: 1,
    alignItems: 'center',
  },
  lastPhaseContainer: {
    flex: 0,
    alignItems: 'flex-end',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  lastIndicatorRow: {
    justifyContent: 'flex-start',
  },
  indicatorWrapper: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  connector: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  phaseNumber: {
    fontSize: 13,
    fontWeight: '600',
  },
  completionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  completionCheck: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 6,
  },
  completionText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

