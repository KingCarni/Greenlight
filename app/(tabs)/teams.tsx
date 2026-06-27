import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function TeamsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="people-outline" size={56} color={Colors.textMuted} />
      <Text style={styles.title}>Teams</Text>
      <Text style={styles.sub}>Invite your crew, assign roles, and collaborate on productions in real time. Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  title: { color: Colors.textPrimary, fontSize: Typography.fontSizeXl, fontWeight: Typography.fontWeightBold, marginTop: Spacing.md },
  sub: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
});
