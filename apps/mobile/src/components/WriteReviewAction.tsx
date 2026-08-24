import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { reviewsApi } from '@ai-commerce/api-client';
import StarRating from './StarRating';

type Stage = 'collapsed' | 'form' | 'submitting' | 'done';

/** Ported from apps/web's WriteReviewAction.tsx — same stage machine and submit contract,
 *  RN shell. Rendered on a delivered order's line item. */
export default function WriteReviewAction({
  orderId,
  productSlug,
  productName,
}: {
  orderId: string;
  productSlug: string;
  productName: string;
}) {
  const [stage, setStage] = useState<Stage>('collapsed');
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (rating < 1) {
      setError('Choose a star rating first.');
      return;
    }
    setError(null);
    setStage('submitting');
    try {
      await reviewsApi.create(productSlug, {
        orderId,
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
      });
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your review. Please try again.");
      setStage('form');
    }
  }

  if (stage === 'done') {
    return <Text style={styles.doneText}>✓ Thanks for your review</Text>;
  }

  if (stage === 'collapsed') {
    return (
      <Pressable onPress={() => setStage('form')} accessibilityRole="button" accessibilityLabel="Write a review">
        <Text style={styles.writeLinkText}>Write a review</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Review {productName}</Text>
      <StarRating value={rating} onChange={setRating} size={18} label="Your rating" />
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        placeholder="Title (optional)"
        style={styles.input}
        accessibilityLabel="Review title"
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        maxLength={2000}
        multiline
        numberOfLines={3}
        placeholder="Share your thoughts (optional)"
        style={[styles.input, styles.textarea]}
        accessibilityLabel="Review body"
      />
      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => void onSubmit()}
          disabled={stage === 'submitting'}
          style={[styles.submitButton, stage === 'submitting' && styles.submitButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Submit review"
        >
          <Text style={styles.submitButtonText}>{stage === 'submitting' ? 'Submitting…' : 'Submit review'}</Text>
        </Pressable>
        <Pressable onPress={() => setStage('collapsed')} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  doneText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  writeLinkText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  form: { marginTop: 8, width: '100%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, gap: 8 },
  formTitle: { fontSize: 12, fontWeight: '700', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  errorText: { color: '#dc2626', fontSize: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  submitButton: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  submitButtonDisabled: { backgroundColor: '#9ca3af' },
  submitButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cancelText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
});
