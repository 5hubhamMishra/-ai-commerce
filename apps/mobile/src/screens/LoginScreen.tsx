import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, authApi } from '@ai-commerce/api-client';
import { useStore } from '../store/useStore';

export default function LoginScreen() {
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'register') await register(email, password, name);
      else if (mode === 'forgot') {
        const result = await authApi.requestPasswordReset(email);
        setResetToken(result.resetToken ?? null);
        setMode(result.resetToken ? 'reset' : 'login');
        if (!result.resetToken) setError(result.message);
      } else {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (password !== confirmation) throw new Error('Passwords do not match.');
        await authApi.resetPassword(resetToken ?? '', password);
        setPassword('');
        setConfirmation('');
        setResetToken(null);
        setMode('login');
        setSuccess('Password updated. You can now sign in.');
      }
      // No manual navigation — RootNavigator switches on the store's authStatus once it
      // flips to 'authenticated'.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Veloura</Text>
      <Text style={styles.subtitle}>
        {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Request a recovery link' : 'Choose a new password'}
      </Text>

      {mode === 'register' && (
        <TextInput
          style={styles.input}
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          accessibilityLabel="Full name"
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Email address"
      />
      {mode !== 'forgot' && (
        <TextInput
          style={styles.input}
          placeholder={mode === 'reset' ? 'New password' : 'Password'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          accessibilityLabel={mode === 'reset' ? 'New password' : 'Password'}
        />
      )}
      {mode === 'reset' && (
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          accessibilityLabel="Confirm password"
        />
      )}

      {error && (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {success && <Text style={styles.success} accessibilityLiveRegion="polite">{success}</Text>}

      <Pressable
        style={styles.button}
        onPress={submit}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : mode === 'forgot' ? 'Request recovery link' : 'Update password'}
        accessibilityState={{ busy: loading, disabled: loading }}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : mode === 'forgot' ? 'Request recovery link' : 'Update password'}</Text>}
      </Pressable>

      {mode === 'login' && (
        <>
          <Pressable onPress={() => { setError(null); setSuccess(null); setMode('forgot'); }} accessibilityRole="button" accessibilityLabel="Forgot password">
            <Text style={styles.switchMode}>Forgot your password?</Text>
          </Pressable>
          <Pressable onPress={() => setMode('register')} accessibilityRole="button" accessibilityLabel="Switch to registration">
            <Text style={styles.switchMode}>Don&apos;t have an account? Register</Text>
          </Pressable>
        </>
      )}
      {mode === 'register' && <Pressable onPress={() => setMode('login')} accessibilityRole="button" accessibilityLabel="Switch to log in"><Text style={styles.switchMode}>Already have an account? Log in</Text></Pressable>}
      {(mode === 'forgot' || mode === 'reset') && <Pressable onPress={() => { setError(null); setSuccess(null); setResetToken(null); setMode('login'); }} accessibilityRole="button" accessibilityLabel="Back to log in"><Text style={styles.switchMode}>Back to log in</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#b45309',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchMode: { textAlign: 'center', marginTop: 16, color: '#b45309' },
  error: { color: '#dc2626', marginBottom: 8, textAlign: 'center' },
  success: { color: '#15803d', marginBottom: 8, textAlign: 'center' },
});
