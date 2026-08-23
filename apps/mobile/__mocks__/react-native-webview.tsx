import { View } from 'react-native';

// react-native-webview's native module isn't registered in the Jest/jest-expo test
// environment (no real device/simulator backs it) — this manual mock stands in as a plain
// View that forwards testID/onMessage so RazorpayCheckout.test.tsx and CheckoutScreen.test.tsx
// can drive `onMessage` directly via `getByTestId(...).props.onMessage(...)`.
export const WebView = View;
