import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';

function ComingSoonScreen({ label }: { label: string }) {
  return (
    <View style={styles.placeholder}>
      <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
      <Text style={styles.placeholderTitle}>{label}</Text>
      <Text style={styles.placeholderSub}>Coming soon</Text>
    </View>
  );
}

function MarketplaceScreen() {
  return <ComingSoonScreen label="Marketplace" />;
}

function TeamsScreen() {
  return <ComingSoonScreen label="Teams" />;
}

export { MarketplaceScreen, TeamsScreen };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.surfaceBorder,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Scene Editor',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="film-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Room Scanner',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Asset Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="images-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: 'Marketplace',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  placeholderTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightBold,
  },
  placeholderSub: {
    color: Colors.textMuted,
    fontSize: Typography.fontSizeSm,
  },
});
