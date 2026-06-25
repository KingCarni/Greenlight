import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
  setError(null);
  setLoading(true);
  const { error } = await signUp(email, password);
  setLoading(false);
  if (error) {
    setError(error);
  }
  // No success state needed — AuthContext session 
  // change will auto-redirect via root layout
}

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>🎬 Greenlight</Text>
        <Text style={styles.tagline}>Create your account</Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {success && (
          <Text style={styles.success}>Check your email to confirm your account.</Text>
        )}

        {!success && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
            </TouchableOpacity>
          </>
        )}

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkAccent}>Sign in</Text></Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  logo: { fontSize: Typography.fontSize3xl, fontWeight: Typography.fontWeightBold, color: Colors.primary, textAlign: 'center', marginBottom: Spacing.xs },
  tagline: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xxl },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: Typography.fontSizeMd,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    marginBottom: Spacing.md,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  linkRow: { marginTop: Spacing.lg, alignItems: 'center' },
  linkText: { color: Colors.textSecondary, fontSize: Typography.fontSizeSm },
  linkAccent: { color: Colors.primary },
  error: { color: Colors.error, fontSize: Typography.fontSizeSm, marginBottom: Spacing.md, textAlign: 'center' },
  success: { color: Colors.success, fontSize: Typography.fontSizeSm, marginBottom: Spacing.md, textAlign: 'center' },
});
