import { render } from '@testing-library/react-native';
import RazorpayCheckout from './RazorpayCheckout';

function postMessage(getByTestId: Awaited<ReturnType<typeof render>>['getByTestId'], data: unknown) {
  getByTestId('razorpay-webview').props.onMessage({ nativeEvent: { data: JSON.stringify(data) } });
}

describe('RazorpayCheckout', () => {
  const baseProps = {
    visible: true,
    keyId: 'rzp_test_key',
    orderId: 'order_abc',
    amount: 1200,
    currency: 'INR',
  };

  it('calls onSuccess with the payment id and signature from a successful widget message', async () => {
    const onSuccess = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = await render(<RazorpayCheckout {...baseProps} onSuccess={onSuccess} onDismiss={onDismiss} />);

    postMessage(getByTestId, {
      type: 'success',
      response: { razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1', razorpay_order_id: 'order_abc' },
    });

    expect(onSuccess).toHaveBeenCalledWith({ razorpayPaymentId: 'pay_1', razorpaySignature: 'sig_1' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('calls onDismiss when the widget reports the shopper dismissed it', async () => {
    const onSuccess = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = await render(<RazorpayCheckout {...baseProps} onSuccess={onSuccess} onDismiss={onDismiss} />);

    postMessage(getByTestId, { type: 'dismiss' });

    expect(onDismiss).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('treats an unparseable message as a dismiss rather than throwing', async () => {
    const onSuccess = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = await render(<RazorpayCheckout {...baseProps} onSuccess={onSuccess} onDismiss={onDismiss} />);

    expect(() =>
      getByTestId('razorpay-webview').props.onMessage({ nativeEvent: { data: 'not json' } }),
    ).not.toThrow();
    expect(onDismiss).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('treats a success message missing the signature fields as a dismiss, not a false success', async () => {
    const onSuccess = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = await render(<RazorpayCheckout {...baseProps} onSuccess={onSuccess} onDismiss={onDismiss} />);

    postMessage(getByTestId, { type: 'success', response: { razorpay_payment_id: 'pay_1' } });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});
