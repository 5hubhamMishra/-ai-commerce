import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { ApiError } from '@ai-commerce/api-client';
import { useStore } from '../store/useStore';

jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

const login = jest.fn();
const register = jest.fn();

function mockStore() {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ login, register }),
  );
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockStore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('logs in with the entered credentials', async () => {
    login.mockResolvedValue(undefined);

    const { getByLabelText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByLabelText('Email address'), 'a@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'password123');
    await fireEvent.press(getByLabelText('Log in'));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('a@example.com', 'password123');
    });
  });

  it('shows the real server error message on a failed login, not a generic string', async () => {
    login.mockRejectedValue(
      new ApiError(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.', requestId: 'r1', details: {} },
      }),
    );

    const { getByLabelText, findByText } = await render(<LoginScreen />);
    await fireEvent.changeText(getByLabelText('Email address'), 'a@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'wrong');
    await fireEvent.press(getByLabelText('Log in'));

    expect(await findByText('Invalid email or password.')).toBeTruthy();
  });

  it('switching to registration mode reveals the name field and calls register on submit', async () => {
    register.mockResolvedValue(undefined);

    const { getByLabelText, queryByLabelText } = await render(<LoginScreen />);
    expect(queryByLabelText('Full name')).toBeNull();

    await fireEvent.press(getByLabelText('Switch to registration'));
    expect(queryByLabelText('Full name')).toBeTruthy();

    await fireEvent.changeText(getByLabelText('Full name'), 'Ada Lovelace');
    await fireEvent.changeText(getByLabelText('Email address'), 'ada@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'password123');
    await fireEvent.press(getByLabelText('Register'));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('ada@example.com', 'password123', 'Ada Lovelace');
    });
  });
});
