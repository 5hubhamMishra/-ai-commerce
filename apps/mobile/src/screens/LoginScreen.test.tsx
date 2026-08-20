import { fireEvent, render, waitFor } from "@testing-library/react-native";
import LoginScreen from "./LoginScreen";
import { ApiError, authApi } from "../api/client";
import { session } from "../api/session";

jest.mock("../api/client", () => ({
  ApiError: jest.requireActual("../api/client").ApiError,
  authApi: { login: jest.fn(), register: jest.fn() },
}));
jest.mock("../api/session", () => ({ session: { save: jest.fn() } }));

describe("LoginScreen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("logs in with the entered credentials and persists the session on success", async () => {
    (authApi.login as jest.Mock).mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: { id: "u1", email: "a@example.com" },
    });
    const onAuthenticated = jest.fn();

    const { getByLabelText } = await render(<LoginScreen onAuthenticated={onAuthenticated} />);
    await fireEvent.changeText(getByLabelText("Email address"), "a@example.com");
    await fireEvent.changeText(getByLabelText("Password"), "password123");
    await fireEvent.press(getByLabelText("Log in"));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith("a@example.com", "password123");
    });
    expect(session.save).toHaveBeenCalledWith("access-1", "refresh-1");
    expect(onAuthenticated).toHaveBeenCalled();
  });

  it("shows the real server error message on a failed login, not a generic string", async () => {
    (authApi.login as jest.Mock).mockRejectedValue(
      new ApiError({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password.", requestId: "r1", details: {} },
      }),
    );

    const { getByLabelText, findByText } = await render(<LoginScreen onAuthenticated={jest.fn()} />);
    await fireEvent.changeText(getByLabelText("Email address"), "a@example.com");
    await fireEvent.changeText(getByLabelText("Password"), "wrong");
    await fireEvent.press(getByLabelText("Log in"));

    expect(await findByText("Invalid email or password.")).toBeTruthy();
  });

  it("switching to registration mode reveals the name field and calls register on submit", async () => {
    (authApi.register as jest.Mock).mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: { id: "u1", email: "a@example.com" },
    });

    const { getByLabelText, queryByLabelText } = await render(<LoginScreen onAuthenticated={jest.fn()} />);
    expect(queryByLabelText("Full name")).toBeNull();

    await fireEvent.press(getByLabelText("Switch to registration"));
    expect(queryByLabelText("Full name")).toBeTruthy();

    await fireEvent.changeText(getByLabelText("Full name"), "Ada Lovelace");
    await fireEvent.changeText(getByLabelText("Email address"), "ada@example.com");
    await fireEvent.changeText(getByLabelText("Password"), "password123");
    await fireEvent.press(getByLabelText("Register"));

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith("ada@example.com", "password123", "Ada Lovelace");
    });
  });
});
