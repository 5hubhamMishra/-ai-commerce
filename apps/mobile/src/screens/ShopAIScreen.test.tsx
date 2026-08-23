import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { shopaiApi } from '@ai-commerce/api-client';
import ShopAIScreen from './ShopAIScreen';
import { useStore } from '../store/useStore';

jest.mock('@ai-commerce/api-client', () => ({
  shopaiApi: { getConversation: jest.fn() },
}));
jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

jest.setTimeout(20000);

const sendShopAIMessage = jest.fn();

function mockStore(overrides: { shopaiConversationId?: string | null } = {}) {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({
      shopaiConversationId: overrides.shopaiConversationId ?? null,
      sendShopAIMessage,
    }),
  );
}

const STARTERS = [
  'A laptop for coding and machine learning under 80000',
  'Good headphones for the gym under 5000',
  'Running shoes under 10000',
  'A formal shirt for the office under 2000',
];

describe('ShopAIScreen', () => {
  beforeEach(() => {
    mockStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the greeting and all starter suggestions', async () => {
    const { findByText, getByLabelText } = await render(<ShopAIScreen />);

    expect(await findByText(/Hi, I'm ShopAI/)).toBeTruthy();
    for (const starter of STARTERS) {
      expect(getByLabelText(starter)).toBeTruthy();
    }
  });

  it('pressing a starter sends it as a message and renders the reply', async () => {
    sendShopAIMessage.mockResolvedValue({ role: 'assistant', content: 'Here are some laptops.' });

    const { getByLabelText, findByText } = await render(<ShopAIScreen />);
    await fireEvent.press(getByLabelText(STARTERS[0]));

    expect(sendShopAIMessage).toHaveBeenCalledWith(STARTERS[0]);
    expect(await findByText(STARTERS[0])).toBeTruthy();
    expect(await findByText('Here are some laptops.')).toBeTruthy();
  });

  it('typing and pressing Send sends the typed text and clears the input', async () => {
    sendShopAIMessage.mockResolvedValue({ role: 'assistant', content: 'Sure, tell me more.' });

    const { getByLabelText, findByText } = await render(<ShopAIScreen />);
    await fireEvent.changeText(getByLabelText('Message ShopAI'), 'shoes under 5000');
    await fireEvent.press(getByLabelText('Send'));

    expect(sendShopAIMessage).toHaveBeenCalledWith('shoes under 5000');
    expect(await findByText('Sure, tell me more.')).toBeTruthy();
    expect(getByLabelText('Message ShopAI').props.value).toBe('');
  });

  it('renders a successful reply under the plain ShopAI label, not the error label', async () => {
    sendShopAIMessage.mockResolvedValue({ role: 'assistant', content: 'All good.' });

    const { getByLabelText, findByText, queryByText } = await render(<ShopAIScreen />);
    await fireEvent.press(getByLabelText(STARTERS[0]));
    await findByText('All good.');

    expect(queryByText("ShopAI — couldn't reply")).toBeNull();
  });

  it('shows the real error message and error label when sending fails', async () => {
    sendShopAIMessage.mockRejectedValue(new Error('Rate limit exceeded.'));

    const { getByLabelText, findByText } = await render(<ShopAIScreen />);
    await fireEvent.press(getByLabelText(STARTERS[0]));

    expect(await findByText('Rate limit exceeded.')).toBeTruthy();
    expect(await findByText("ShopAI — couldn't reply")).toBeTruthy();
  });

  it('restores a previous conversation on mount when a conversation id already exists', async () => {
    mockStore({ shopaiConversationId: 'conv-1' });
    (shopaiApi.getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      messages: [
        { id: 'm1', role: 'USER', content: 'hi there', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'm2', role: 'ASSISTANT', content: 'hello back', createdAt: '2026-01-01T00:00:01.000Z' },
      ],
    });

    const { findByText } = await render(<ShopAIScreen />);

    expect(await findByText('hi there')).toBeTruthy();
    expect(await findByText('hello back')).toBeTruthy();
    expect(shopaiApi.getConversation).toHaveBeenCalledWith('conv-1');
  });

  it('disables the Send button while a message is in flight', async () => {
    let resolveSend: (value: { role: 'assistant'; content: string }) => void;
    sendShopAIMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    const { getByLabelText, findByText } = await render(<ShopAIScreen />);
    await fireEvent.press(getByLabelText(STARTERS[0]));

    await waitFor(() => expect(getByLabelText('Send').props.accessibilityState.disabled).toBe(true));

    resolveSend!({ role: 'assistant', content: 'done' });
    expect(await findByText('done')).toBeTruthy();
    await waitFor(() => expect(getByLabelText('Send').props.accessibilityState.disabled).toBe(false));
  });
});
