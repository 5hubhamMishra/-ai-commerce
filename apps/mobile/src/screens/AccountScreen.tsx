import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useStore } from "../store/useStore";
import type { AccountStackParamList } from "../navigation/types";

// user/authStatus are already resolved by the time this screen can even render — RootNavigator
// only mounts the authenticated tab stack once the store's authStatus is 'authenticated' (set
// alongside `user` by login/register/restoreSession), so there's no separate fetch-on-mount or
// loading/error state to manage here, unlike the old HomeScreen this replaces.
type Props = NativeStackScreenProps<AccountStackParamList, "AccountHome">;

export default function AccountScreen({ navigation }: Props) {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const exportMyData = useStore((s) => s.exportMyData);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const [exporting, setExporting] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      await Share.share({
        title: "Veloura data export",
        message: JSON.stringify(data, null, 2),
      });
    } catch {
      Alert.alert(
        "Export unavailable",
        "Could not prepare your data export. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (!deletePassword) return;
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      setDeleteVisible(false);
      setDeletePassword("");
    } catch {
      Alert.alert(
        "Could not delete account",
        "The password was incorrect or the account could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

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
        onPress={() => navigation.navigate("OrderList")}
        accessibilityRole="button"
        accessibilityLabel="My Orders"
      >
        <Text style={styles.ordersButtonText}>My Orders</Text>
      </Pressable>
      <Pressable
        style={styles.ordersButton}
        onPress={() => navigation.navigate("Notifications")}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <Text style={styles.ordersButtonText}>Notifications</Text>
      </Pressable>
      <Pressable
        style={styles.ordersButton}
        onPress={() => void handleExport()}
        disabled={exporting}
        accessibilityRole="button"
        accessibilityLabel="Export my data"
      >
        <Text style={styles.ordersButtonText}>
          {exporting ? "Preparing export..." : "Export my data"}
        </Text>
      </Pressable>
      <Pressable
        style={styles.deleteButton}
        onPress={() => setDeleteVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        <Text style={styles.deleteButtonText}>Delete account</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => void logout()}
        accessibilityRole="button"
        accessibilityLabel="Log out"
      >
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
      <Modal
        visible={deleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleting) setDeleteVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              Your personal data will be erased and sign-in will be disabled.
            </Text>
            <TextInput
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Confirm your password"
              secureTextEntry
              editable={!deleting}
              accessibilityLabel="Confirm your password"
              style={styles.passwordInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setDeleteVisible(false)}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDelete()}
                disabled={deleting || !deletePassword}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete account"
              >
                <Text style={styles.deleteButtonText}>
                  {deleting ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: { fontSize: 32, fontWeight: "700", marginBottom: 24 },
  welcome: { fontSize: 20, fontWeight: "600" },
  email: { fontSize: 14, color: "#6b7280", marginTop: 4, marginBottom: 24 },
  ordersButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    minWidth: 200,
    alignItems: "center",
  },
  ordersButtonText: { color: "#111827", fontSize: 16, fontWeight: "600" },
  button: {
    backgroundColor: "#b45309",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    minWidth: 200,
    alignItems: "center",
  },
  deleteButtonText: { color: "#dc2626", fontSize: 16, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: { borderRadius: 12, padding: 20, backgroundColor: "#fff" },
  modalTitle: { color: "#111827", fontSize: 20, fontWeight: "700" },
  modalBody: { color: "#4b5563", fontSize: 14, lineHeight: 20, marginTop: 8 },
  passwordInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 20,
    marginTop: 18,
  },
  cancelText: { color: "#4b5563", fontSize: 15, fontWeight: "600" },
});
