import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WishlistScreen from '../screens/WishlistScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import type { WishlistStackParamList } from './types';

const Stack = createNativeStackNavigator<WishlistStackParamList>();

export default function WishlistStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WishlistHome" component={WishlistScreen} options={{ title: 'Wishlist' }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
