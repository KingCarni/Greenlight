import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Library — Coming Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  text: { color: Colors.textMuted, fontSize: Typography.fontSizeMd },
});