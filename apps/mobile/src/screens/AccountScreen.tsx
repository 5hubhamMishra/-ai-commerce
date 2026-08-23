import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useStore } from '../store/useStore';
import type { AccountStackParamList } from '../navigation/types';

// user/authStatus are already resolved by the time this screen can even render — RootNavigator
// only mounts the authenticated tab stack once the store's authStatus is 'authenticated' (set
// alongside `user` by login/register/restoreSession), so there's no separate fetch-on-mount or
// loading/error state to manage here, unlike the old HomeScreen this replaces.
type Props = NativeStackScreenProps<AccountStackParamList, 'AccountHome'>;

export default function AccountScreen({ navigation }: Props) {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Veloura</Text>
      {user && (
        <>
          <Text style={styles.welcome}>Welcome, {user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </>
      )}
      <Pressable
        style={styles.ordersButton}
        onPress={() => navigation.navigate('OrderList')}
        accessibilityRole="button"
        accessibilityLabel="My Orders"
      >
        <Text style={styles.ordersButtonText}>My Orders</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => void logout()}
        accessibilityRole="button"
        accessibilityLabel="Log out"
      >
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
  ordersButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  ordersButtonText: { color: '#111827', fontSize: 16, fontWeight: '600' },
  button: { backgroundColor: '#b45309', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
