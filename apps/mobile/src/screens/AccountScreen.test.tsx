import { fireEvent, render } from "@testing-library/react-native";
import AccountScreen from "./AccountScreen";
import { useStore } from "../store/useStore";

jest.mock("../store/useStore", () => ({
  useStore: jest.fn(),
}));

const logout = jest.fn();
const exportMyData = jest.fn();
const deleteAccount = jest.fn();
const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<
  typeof AccountScreen
>[0]["navigation"];

function mockStore(user: { name: string; email: string } | null) {
  (useStore as unknown as jest.Mock).mockImplementation(
    (selector: (state: unknown) => unknown) =>
      selector({ user, logout, exportMyData, deleteAccount }),
  );
}

describe("AccountScreen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the logged-in user's name and email", async () => {
    mockStore({ name: "Ada Lovelace", email: "ada@example.com" });

    const { findByText } = await render(
      <AccountScreen navigation={navigation} route={{} as never} />,
    );
    expect(await findByText("Welcome, Ada Lovelace")).toBeTruthy();
    expect(await findByText("ada@example.com")).toBeTruthy();
  });

  it("calls logout when the log out button is pressed", async () => {
    mockStore({ name: "Ada Lovelace", email: "ada@example.com" });

    const { getByLabelText } = await render(
      <AccountScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(getByLabelText("Log out"));

    expect(logout).toHaveBeenCalled();
  });

  it("navigates to My Orders when pressed", async () => {
    mockStore({ name: "Ada Lovelace", email: "ada@example.com" });

    const { getByLabelText } = await render(
      <AccountScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(getByLabelText("My Orders"));

    expect(navigate).toHaveBeenCalledWith("OrderList");
  });

  it("navigates to notifications when pressed", async () => {
    mockStore({ name: "Ada Lovelace", email: "ada@example.com" });

    const { getByLabelText } = await render(
      <AccountScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(getByLabelText("Notifications"));

    expect(navigate).toHaveBeenCalledWith("Notifications");
  });

  it("exports account data through the existing privacy action", async () => {
    exportMyData.mockResolvedValue({ account: { email: "ada@example.com" } });

    mockStore({ name: "Ada Lovelace", email: "ada@example.com" });
    const { getByLabelText } = await render(
      <AccountScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(getByLabelText("Export my data"));

    expect(exportMyData).toHaveBeenCalled();
  });

  it("requires the password before deleting the account", async () => {
    deleteAccount.mockResolvedValue(undefined);

    mockStore({ name: "Ada Lovelace", email: "ada@example.com" });
    const { getByLabelText } = await render(
      <AccountScreen navigation={navigation} route={{} as never} />,
    );
    await fireEvent.press(getByLabelText("Delete account"));
    await fireEvent.changeText(
      getByLabelText("Confirm your password"),
      "correct-password",
    );
    await fireEvent.press(getByLabelText("Permanently delete account"));

    expect(deleteAccount).toHaveBeenCalledWith("correct-password");
  });
});
