import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, authApi, usersApi, type PublicUser } from '../api/client';
import { session } from '../api/session';

type Props = {
  onLoggedOut: () => void;
};

export default function HomeScreen({ onLoggedOut }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    const accessToken = await session.getAccessToken();
    if (!accessToken) return onLoggedOut();
    setLoading(true);
    setError(null);
    try {
      setUser(await usersApi.me(accessToken));
    } catch (err) {
      // Same real-error-message-first pattern as LoginScreen — a generic
      // "could not load" string hid the actual server response, leaving no
      // way to tell a network failure apart from an auth/permission one.
      setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [onLoggedOut]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const logout = async () => {
    const refreshToken = await session.getRefreshToken();
    if (refreshToken) await authApi.logout(refreshToken).catch(() => undefined);
    await session.clear();
    onLoggedOut();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Veloura</Text>
      {user ? (
        <>
          <Text style={styles.welcome}>Welcome, {user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </>
      ) : error ? (
        <>
          <Text style={styles.email} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
          <Pressable
            style={[styles.button, styles.retryButton]}
            onPress={loadProfile}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            accessibilityState={{ busy: loading, disabled: loading }}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Try again</Text>}
          </Pressable>
        </>
      ) : (
        <Text style={styles.email} accessibilityLiveRegion="polite">
          Loading your profile…
        </Text>
      )}
      <Pressable style={styles.button} onPress={logout} accessibilityRole="button" accessibilityLabel="Log out">
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 24 },
  welcome: { fontSize: 20, fontWeight: '600' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 24 },
  button: { backgroundColor: '#b45309', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  retryButton: { marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
