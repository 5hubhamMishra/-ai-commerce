import { fireEvent, render } from '@testing-library/react-native';
import AccountScreen from './AccountScreen';
import { useStore } from '../store/useStore';

jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

const logout = jest.fn();

function mockStore(user: { name: string; email: string } | null) {
  (useStore as unknown as jest.Mock).mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ user, logout }),
  );
}

describe('AccountScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the logged-in user's name and email", async () => {
    mockStore({ name: 'Ada Lovelace', email: 'ada@example.com' });

    const { findByText } = await render(<AccountScreen />);
    expect(await findByText('Welcome, Ada Lovelace')).toBeTruthy();
    expect(await findByText('ada@example.com')).toBeTruthy();
  });

  it('calls logout when the log out button is pressed', async () => {
    mockStore({ name: 'Ada Lovelace', email: 'ada@example.com' });

    const { getByLabelText } = await render(<AccountScreen />);
    await fireEvent.press(getByLabelText('Log out'));

    expect(logout).toHaveBeenCalled();
  });
});
