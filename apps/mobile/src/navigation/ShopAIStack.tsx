import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ShopAIScreen from '../screens/ShopAIScreen';
import type { ShopAIStackParamList } from './types';

const Stack = createNativeStackNavigator<ShopAIStackParamList>();

export default function ShopAIStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ShopAIHome" component={ShopAIScreen} options={{ title: 'ShopAI' }} />
    </Stack.Navigator>
  );
}
