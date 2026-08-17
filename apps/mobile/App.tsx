import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import { session } from './src/api/session';

type RootStackParamList = { Login: undefined; Home: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    session.getAccessToken().then((token) => {
      setAuthenticated(Boolean(token));
      setCheckingSession(false);
    });
  }, []);

  const handleAuthenticated = useCallback(() => setAuthenticated(true), []);
  const handleLoggedOut = useCallback(() => setAuthenticated(false), []);

  if (checkingSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {authenticated ? (
          <Stack.Screen name="Home">{() => <HomeScreen onLoggedOut={handleLoggedOut} />}</Stack.Screen>
        ) : (
          <Stack.Screen name="Login">{() => <LoginScreen onAuthenticated={handleAuthenticated} />}</Stack.Screen>
        )}
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
