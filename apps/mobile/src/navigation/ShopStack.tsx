import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ShopHomeScreen from '../screens/ShopHomeScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import type { ShopStackParamList } from './types';

const Stack = createNativeStackNavigator<ShopStackParamList>();

export default function ShopStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ShopHome" component={ShopHomeScreen} options={{ title: 'Shop' }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
