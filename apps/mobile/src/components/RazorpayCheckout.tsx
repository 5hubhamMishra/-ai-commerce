import { useMemo } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type RazorpaySuccessResult = {
  razorpayPaymentId: string;
  razorpaySignature: string;
};

type Props = {
  visible: boolean;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  onSuccess: (result: RazorpaySuccessResult) => void;
  onDismiss: () => void;
};

/**
 * Mirrors apps/web's checkout page (window.Razorpay(...).open()), but React Native has no
 * `window`/script-tag environment to load Checkout.js into — so the same widget is loaded
 * inside a WebView instead, running as a tiny self-contained HTML page. All values interpolated
 * into that page come from our own trusted apps/api response (payment.providerRef/amount/
 * currency) or the build-time EXPO_PUBLIC_RAZORPAY_KEY_ID env var, never from user input.
 */
function buildCheckoutHtml({ keyId, orderId, amount, currency }: Omit<Props, 'visible' | 'onSuccess' | 'onDismiss'>) {
  const options = {
    key: keyId,
    order_id: orderId,
    // Razorpay Checkout.js expects the smallest currency subunit (paise for INR), same as
    // apps/web's Math.round(payment.amount * 100) — payment.amount itself is rupees.
    amount: Math.round(amount * 100),
    currency,
    name: 'Veloura',
  };
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;background:#fff">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var options = ${JSON.stringify(options)};
  options.handler = function (response) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', response: response }));
  };
  options.modal = {
    ondismiss: function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismiss' }));
    }
  };
  var rzp = new Razorpay(options);
  rzp.open();
</script>
</body>
</html>`;
}

export default function RazorpayCheckout({ visible, keyId, orderId, amount, currency, onSuccess, onDismiss }: Props) {
  const html = useMemo(
    () => buildCheckoutHtml({ keyId, orderId, amount, currency }),
    [keyId, orderId, amount, currency],
  );

  function handleMessage(event: WebViewMessageEvent) {
    let data: { type?: string; response?: { razorpay_payment_id?: string; razorpay_signature?: string } };
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      onDismiss();
      return;
    }
    if (data.type === 'success' && data.response?.razorpay_payment_id && data.response?.razorpay_signature) {
      onSuccess({
        razorpayPaymentId: data.response.razorpay_payment_id,
        razorpaySignature: data.response.razorpay_signature,
      });
    } else {
      onDismiss();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss} testID="razorpay-checkout-modal">
      <View style={styles.container}>
        <WebView
          testID="razorpay-webview"
          originWhitelist={['*']}
          source={{ html }}
          onMessage={handleMessage}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});
