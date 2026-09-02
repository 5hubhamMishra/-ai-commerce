import { startTransition, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Address, CreatePaymentResponse, ShippingMethodQuote } from '@ai-commerce/types';
import { ordersApi, paymentsApi, shippingApi } from '@ai-commerce/api-client';
import { useStore } from '../store/useStore';
import { formatPrice } from '../lib/format';
import RazorpayCheckout, { type RazorpaySuccessResult } from '../components/RazorpayCheckout';
import type { CartStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<CartStackParamList, 'Checkout'>;

// Unset in every dev/test/CI environment (including this app's own Jest suite) — the
// simulated, instant-confirm `placeOrder` path stays byte-for-byte unchanged there. Set only
// alongside the backend's PAYMENT_PROVIDER=razorpay/RAZORPAY_KEY_ID (same Razorpay dashboard
// credential pair), which is what actually opens the real Checkout widget — see apps/web's
// identical NEXT_PUBLIC_RAZORPAY_KEY_ID gate in src/app/checkout/page.tsx.
const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

type NewAddressFields = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const EMPTY_ADDRESS: NewAddressFields = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
};

export default function CheckoutScreen({ navigation }: Props) {
  const cart = useStore((s) => s.cart);
  const addresses = useStore((s) => s.addresses);
  const addressesStatus = useStore((s) => s.addressesStatus);
  const fetchAddresses = useStore((s) => s.fetchAddresses);
  const createAddress = useStore((s) => s.createAddress);
  const placeOrder = useStore((s) => s.placeOrder);
  const finalizeOrder = useStore((s) => s.finalizeOrder);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newAddress, setNewAddress] = useState<NewAddressFields>(EMPTY_ADDRESS);
  const [savingAddress, setSavingAddress] = useState(false);

  const [quotes, setQuotes] = useState<ShippingMethodQuote[] | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kept across retries (e.g. the shopper dismisses the Razorpay widget without paying) so a
  // retry only re-runs the payment-intent step, never mints a second order — mirrors apps/web.
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<CreatePaymentResponse | null>(null);

  useEffect(() => {
    void fetchAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Falls back to the default/first address only absent an explicit user pick — not synced
  // into state via an effect, so it never fights a real selection.
  const effectiveAddressId = useMemo(() => {
    if (selectedAddressId) return selectedAddressId;
    if (!addresses || addresses.length === 0) return null;
    return addresses.find((a) => a.isDefault)?.id ?? addresses[0].id;
  }, [addresses, selectedAddressId]);
  const showAddForm = addingNew || (addresses !== null && addresses.length === 0);

  useEffect(() => {
    if (!effectiveAddressId) return;
    let cancelled = false;
    startTransition(() => {
      setQuotesLoading(true);
      setQuotes(null);
      setSelectedMethod(null);
    });
    shippingApi
      .quote(effectiveAddressId)
      .then((result) => {
        if (cancelled) return;
        setQuotes(result);
        setSelectedMethod(result[0]?.method ?? null);
      })
      .catch(() => {
        if (!cancelled) setQuotes([]);
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveAddressId]);

  const selectedQuote = useMemo(() => quotes?.find((q) => q.method === selectedMethod) ?? null, [quotes, selectedMethod]);
  const subtotal = cart?.subtotal ?? 0;
  const shippingFee = selectedQuote?.fee ?? 0;
  const total = subtotal + shippingFee;
  const invalidatePendingOrder = () => {
    setOrderId(null);
    setPendingPayment(null);
  };

  const newAddressComplete =
    !!newAddress.line1.trim() &&
    !!newAddress.city.trim() &&
    !!newAddress.state.trim() &&
    !!newAddress.postalCode.trim() &&
    !!newAddress.country.trim();

  async function onSaveAddress() {
    if (!newAddressComplete) return;
    invalidatePendingOrder();
    setError(null);
    setSavingAddress(true);
    try {
      const created = await createAddress({
        label: newAddress.label.trim() || undefined,
        line1: newAddress.line1.trim(),
        line2: newAddress.line2.trim() || undefined,
        city: newAddress.city.trim(),
        state: newAddress.state.trim(),
        postalCode: newAddress.postalCode.trim(),
        country: newAddress.country.trim(),
        isDefault: !addresses || addresses.length === 0,
      });
      setSelectedAddressId(created.id);
      setAddingNew(false);
      setNewAddress(EMPTY_ADDRESS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that address. Please try again.");
    } finally {
      setSavingAddress(false);
    }
  }

  async function onPlaceOrder() {
    if (!effectiveAddressId || !selectedMethod) return;
    setError(null);
    setPlacing(true);
    try {
      if (!RAZORPAY_KEY_ID) {
        // Simulated path — unchanged from before, no widget.
        const order = await placeOrder(effectiveAddressId, selectedMethod as 'STANDARD' | 'EXPRESS');
        navigation.replace('OrderDetail', { id: order.id });
        return;
      }

      const currentOrderId =
        orderId ??
        (await ordersApi.create({ addressId: effectiveAddressId, shippingMethod: selectedMethod as 'STANDARD' | 'EXPRESS' })).id;
      setOrderId(currentOrderId);
      const payment = await paymentsApi.create(currentOrderId);
      setPendingPayment(payment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place your order. Please try again.");
      setPlacing(false);
    }
  }

  async function onRazorpaySuccess(result: RazorpaySuccessResult) {
    if (!orderId || !pendingPayment) return;
    try {
      const order = await finalizeOrder(orderId, pendingPayment.paymentId, result);
      setPendingPayment(null);
      navigation.replace('OrderDetail', { id: order.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm your payment. Please try again.");
      setPendingPayment(null);
      setPlacing(false);
    }
  }

  function onRazorpayDismiss() {
    setPendingPayment(null);
    setError("Payment was not completed. You can try again — your order hasn't been lost.");
    setPlacing(false);
  }

  const canSubmit = !showAddForm && !!effectiveAddressId && !!selectedMethod && !placing;

  if (!cart || cart.items.length === 0) {
    return (
      <View style={styles.centerMessage}>
        <Text style={styles.emptyText}>Your cart is empty.</Text>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.navigate('CartHome')}
          accessibilityRole="button"
          accessibilityLabel="Back to cart"
        >
          <Text style={styles.backButtonText}>Back to cart</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Shipping address</Text>
      {addressesStatus === 'loading' && !addresses && <ActivityIndicator style={styles.spinner} />}

      {addresses && addresses.length > 0 && (
        <View style={styles.addressList}>
          {addresses.map((a) => (
            <AddressRow
              key={a.id}
              address={a}
              selected={!showAddForm && effectiveAddressId === a.id}
              disabled={placing}
              onSelect={() => {
                invalidatePendingOrder();
                setAddingNew(false);
                setSelectedAddressId(a.id);
              }}
            />
          ))}
          {!showAddForm && (
            <Pressable
              onPress={() => {
                invalidatePendingOrder();
                setAddingNew(true);
              }}
              disabled={placing}
              accessibilityRole="button"
              accessibilityLabel="Use a new address"
            >
              <Text style={styles.linkText}>+ Use a new address</Text>
            </Pressable>
          )}
        </View>
      )}

      {showAddForm && (
        <AddressForm
          value={newAddress}
          onChange={setNewAddress}
          onSave={() => void onSaveAddress()}
          onUseSaved={addresses && addresses.length > 0 ? () => {
            invalidatePendingOrder();
            setAddingNew(false);
          } : null}
          saving={savingAddress}
          complete={newAddressComplete}
        />
      )}

      <Text style={styles.sectionTitle}>Shipping method</Text>
      {quotesLoading && <ActivityIndicator style={styles.spinner} />}
      {!quotesLoading && quotes && quotes.length > 0 && (
        <View style={styles.quoteList}>
          {quotes.map((q) => {
            const selected = selectedMethod === q.method;
            return (
              <Pressable
                key={q.method}
                style={[styles.quoteRow, selected && styles.quoteRowSelected]}
                onPress={() => {
                  invalidatePendingOrder();
                  setSelectedMethod(q.method);
                }}
                disabled={placing}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={q.label}
              >
                <View>
                  <Text style={styles.quoteLabel}>{q.label}</Text>
                  <Text style={styles.quoteDays}>
                    {q.estimatedDaysMin}–{q.estimatedDaysMax} days
                  </Text>
                </View>
                <Text style={styles.quoteFee}>{q.fee === 0 ? 'Free' : formatPrice(q.fee)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!quotesLoading && !effectiveAddressId && !showAddForm && (
        <Text style={styles.helperText}>Select an address to see shipping options.</Text>
      )}

      <Text style={styles.sectionTitle}>Payment method</Text>
      <View style={styles.paymentPanel}>
        {RAZORPAY_KEY_ID ? (
          <>
            <Text style={styles.paymentTitle}>Secure payment via Razorpay</Text>
            <Text style={styles.paymentDisclaimer}>
              You&apos;ll be asked to complete payment in a secure Razorpay window before your order is confirmed.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.paymentTitle}>Simulated payment</Text>
            <Text style={styles.paymentDisclaimer}>
              This places a real order against the store&apos;s backend, but payment settlement itself is simulated
              — no card details are collected and no real charge occurs.
            </Text>
          </>
        )}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Order summary</Text>
        {cart.items.map((l) => (
          <View key={l.id} style={styles.summaryRow}>
            <Text style={styles.summaryLine} numberOfLines={2}>
              {l.productName} × {l.quantity}
            </Text>
            <Text style={styles.summaryValue}>{formatPrice(l.lineTotal)}</Text>
          </View>
        ))}
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <Text style={styles.summaryValue}>{selectedQuote ? (shippingFee === 0 ? 'Free' : formatPrice(shippingFee)) : '—'}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPrice(total)}</Text>
        </View>
      </View>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={() => void onPlaceOrder()}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Place order"
      >
        <Text style={styles.submitButtonText}>{placing ? 'Placing order…' : `Place order — ${formatPrice(total)}`}</Text>
      </Pressable>

      {RAZORPAY_KEY_ID && pendingPayment && (
        <RazorpayCheckout
          visible
          keyId={RAZORPAY_KEY_ID}
          orderId={pendingPayment.providerRef}
          amount={pendingPayment.amount}
          currency={pendingPayment.currency}
          onSuccess={(result) => void onRazorpaySuccess(result)}
          onDismiss={onRazorpayDismiss}
        />
      )}
    </ScrollView>
  );
}

function AddressRow({ address, selected, disabled, onSelect }: { address: Address; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <Pressable
      style={[styles.addressRow, selected && styles.addressRowSelected]}
      onPress={onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={address.line1}
    >
      <View style={styles.addressHeader}>
        <View style={[styles.radioDot, selected && styles.radioDotSelected]} />
        {address.label && <Text style={styles.addressLabelBadge}>{address.label}</Text>}
        {address.isDefault && <Text style={styles.defaultBadge}>Default</Text>}
      </View>
      <Text style={styles.addressLine}>
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.postalCode}, {address.country}
      </Text>
    </Pressable>
  );
}

function AddressForm({
  value,
  onChange,
  onSave,
  onUseSaved,
  saving,
  complete,
}: {
  value: NewAddressFields;
  onChange: (next: NewAddressFields) => void;
  onSave: () => void;
  onUseSaved: (() => void) | null;
  saving: boolean;
  complete: boolean;
}) {
  function field(key: keyof NewAddressFields, label: string) {
    return (
      <TextInput
        style={styles.input}
        placeholder={label}
        value={value[key]}
        onChangeText={(text) => onChange({ ...value, [key]: text })}
        accessibilityLabel={label}
      />
    );
  }
  return (
    <View style={styles.addressForm}>
      {field('label', 'Label (e.g. Home, Work) — optional')}
      {field('line1', 'House no, building, street')}
      {field('line2', 'Landmark, area — optional')}
      {field('city', 'City')}
      {field('state', 'State')}
      {field('postalCode', 'PIN code')}
      {field('country', 'Country')}
      <Pressable
        style={[styles.saveButton, (!complete || saving) && styles.saveButtonDisabled]}
        onPress={onSave}
        disabled={!complete || saving}
        accessibilityRole="button"
        accessibilityLabel="Save address"
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save address'}</Text>
      </Pressable>
      {onUseSaved && (
        <Pressable onPress={onUseSaved} accessibilityRole="button" accessibilityLabel="Use a saved address instead">
          <Text style={styles.linkText}>← Use a saved address instead</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#6b7280', marginBottom: 16 },
  backButton: { backgroundColor: '#b45309', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  backButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 20, marginBottom: 8 },
  spinner: { marginVertical: 12 },
  addressList: { gap: 8 },
  addressRow: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 12 },
  addressRowSelected: { borderColor: '#b45309', backgroundColor: '#fef3c7' },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radioDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#d1d5db' },
  radioDotSelected: { borderColor: '#b45309', backgroundColor: '#b45309' },
  addressLabelBadge: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' },
  defaultBadge: { fontSize: 10, fontWeight: '700', color: '#b45309', textTransform: 'uppercase' },
  addressLine: { fontSize: 13, color: '#374151', marginTop: 6, lineHeight: 19 },
  linkText: { fontSize: 13, fontWeight: '600', color: '#b45309', marginTop: 4 },
  addressForm: { marginTop: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveButton: { backgroundColor: '#b45309', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  saveButtonDisabled: { backgroundColor: '#e5e7eb' },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  quoteList: { gap: 8 },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
  },
  quoteRowSelected: { borderColor: '#b45309', backgroundColor: '#fef3c7' },
  quoteLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  quoteDays: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  quoteFee: { fontSize: 14, fontWeight: '700', color: '#111827' },
  helperText: { fontSize: 13, color: '#6b7280' },
  paymentPanel: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 14, backgroundColor: '#f9fafb' },
  paymentTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  paymentDisclaimer: { fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 17 },
  summary: { marginTop: 24, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLine: { flex: 1, fontSize: 13, color: '#6b7280', marginRight: 8 },
  summaryLabel: { fontSize: 13, color: '#6b7280' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  summaryDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#111827' },
  errorText: { color: '#dc2626', marginTop: 16, textAlign: 'center' },
  submitButton: { backgroundColor: '#b45309', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  submitButtonDisabled: { backgroundColor: '#e5e7eb' },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
