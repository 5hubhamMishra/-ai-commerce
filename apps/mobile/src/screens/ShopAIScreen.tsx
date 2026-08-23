import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { shopaiApi } from '@ai-commerce/api-client';
import { useStore } from '../store/useStore';

type ChatTurn = { role: 'user' | 'assistant'; content: string; isError?: boolean };

const GREETING: ChatTurn = {
  role: 'assistant',
  content:
    "Hi, I'm ShopAI. Tell me what you're shopping for — a use case, a budget, or a category — and I'll search the catalog for you.",
};

const STARTERS = [
  'A laptop for coding and machine learning under 80000',
  'Good headphones for the gym under 5000',
  'Running shoes under 10000',
  'A formal shirt for the office under 2000',
];

export default function ShopAIScreen() {
  const shopaiConversationId = useStore((s) => s.shopaiConversationId);
  const sendShopAIMessage = useStore((s) => s.sendShopAIMessage);

  const [history, setHistory] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatTurn>>(null);

  // Defensive parity with web, not a fix for a reachable mobile bug today: shopaiConversationId
  // has no persist middleware, so it and `history` are wiped together on any real cold start —
  // this only matters if ShopAIScreen unmounts/remounts within a still-running session while the
  // store survives (a future nav refactor, Fast Refresh), which doesn't happen today.
  useEffect(() => {
    if (!shopaiConversationId) return;
    let cancelled = false;
    shopaiApi
      .getConversation(shopaiConversationId)
      .then((conversation) => {
        if (cancelled || conversation.messages.length === 0) return;
        setHistory([
          GREETING,
          ...conversation.messages.map(
            (m): ChatTurn => ({
              role: m.role === 'USER' ? 'user' : 'assistant',
              content: m.content,
            }),
          ),
        ]);
      })
      .catch(() => {
        // Stale/expired conversation: fall back to greeting-only; sendShopAIMessage separately
        // recovers by starting a fresh conversation on the next send.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [history, sending]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setHistory((h) => [...h, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    try {
      const reply = await sendShopAIMessage(text);
      setHistory((h) => [...h, { role: 'assistant', content: reply.content }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setHistory((h) => [...h, { role: 'assistant', content: message, isError: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.subtitle}>Searches the real catalog — never invents a product</Text>
      <FlatList
        ref={listRef}
        data={history}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <ChatBubble turn={item} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          history.length <= 1 ? (
            <View style={styles.starters}>
              <Text style={styles.startersLabel}>Try asking:</Text>
              {STARTERS.map((s) => (
                <Pressable
                  key={s}
                  style={styles.starterRow}
                  onPress={() => void send(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                >
                  <Text style={styles.starterText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        ListFooterComponent={sending ? <TypingIndicator /> : null}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask ShopAI anything..."
          accessibilityLabel="Message ShopAI"
          editable={!sending}
          onSubmitEditing={() => void send(input)}
        />
        <Pressable
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={() => void send(input)}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: sending, busy: sending }}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{turn.content}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.assistantRow}>
      <View style={[styles.assistantBubble, turn.isError && styles.assistantBubbleError]}>
        <Text style={[styles.assistantLabel, turn.isError && styles.assistantLabelError]}>
          {turn.isError ? "ShopAI — couldn't reply" : 'ShopAI'}
        </Text>
        <Text style={styles.assistantText}>{turn.content}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantBubble}>
        <Text style={styles.assistantLabel}>ShopAI</Text>
        <Text style={styles.typingDots}>• • •</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  listContent: { padding: 16, paddingBottom: 8 },
  starters: { marginBottom: 12 },
  startersLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  starterRow: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  starterText: { fontSize: 13, color: '#111827', fontWeight: '500' },
  userRow: { alignItems: 'flex-end', marginBottom: 12 },
  userBubble: { maxWidth: '80%', backgroundColor: '#111827', borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { color: '#fff', fontSize: 14 },
  assistantRow: { alignItems: 'flex-start', marginBottom: 12 },
  assistantBubble: {
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  assistantBubbleError: { borderColor: '#dc2626' },
  assistantLabel: { fontSize: 11, fontWeight: '700', color: '#b45309', marginBottom: 4 },
  assistantLabelError: { color: '#dc2626' },
  assistantText: { fontSize: 14, color: '#111827', lineHeight: 20 },
  typingDots: { fontSize: 14, color: '#9ca3af', letterSpacing: 2 },
  inputBar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: { backgroundColor: '#111827', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendButtonDisabled: { backgroundColor: '#e5e7eb' },
  sendButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
