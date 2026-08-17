import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { authApi, usersApi, type PublicUser } from '../api/client';
import { session } from '../api/session';

type Props = {
  onLoggedOut: () => void;
};

export default function HomeScreen({ onLoggedOut }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const accessToken = await session.getAccessToken();
      if (!accessToken) return onLoggedOut();
      try {
        setUser(await usersApi.me(accessToken));
      } catch {
        setError('Could not load your profile.');
      }
    })();
  }, [onLoggedOut]);

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
      ) : (
        <Text style={styles.email}>{error ?? 'Loading your profile…'}</Text>
      )}
      <Pressable style={styles.button} onPress={logout}>
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
