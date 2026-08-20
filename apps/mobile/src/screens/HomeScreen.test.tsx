import { fireEvent, render, waitFor } from "@testing-library/react-native";
import HomeScreen from "./HomeScreen";
import { ApiError, authApi, usersApi } from "../api/client";
import { session } from "../api/session";

jest.mock("../api/client", () => ({
  ApiError: jest.requireActual("../api/client").ApiError,
  authApi: { logout: jest.fn().mockResolvedValue(undefined) },
  usersApi: { me: jest.fn() },
}));
jest.mock("../api/session", () => ({
  session: { getAccessToken: jest.fn(), getRefreshToken: jest.fn(), clear: jest.fn() },
}));

describe("HomeScreen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("logs the user straight out when there is no stored access token", async () => {
    (session.getAccessToken as jest.Mock).mockResolvedValue(null);
    const onLoggedOut = jest.fn();

    await render(<HomeScreen onLoggedOut={onLoggedOut} />);

    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
    expect(usersApi.me).not.toHaveBeenCalled();
  });

  it("loads and displays the real profile when a token is present", async () => {
    (session.getAccessToken as jest.Mock).mockResolvedValue("access-1");
    (usersApi.me as jest.Mock).mockResolvedValue({ id: "u1", name: "Ada Lovelace", email: "ada@example.com" });

    const { findByText } = await render(<HomeScreen onLoggedOut={jest.fn()} />);

    expect(await findByText("Welcome, Ada Lovelace")).toBeTruthy();
    expect(await findByText("ada@example.com")).toBeTruthy();
  });

  it("shows the real server error and a working retry button on failure", async () => {
    (session.getAccessToken as jest.Mock).mockResolvedValue("access-1");
    (usersApi.me as jest.Mock)
      .mockRejectedValueOnce(
        new ApiError({ error: { code: "SERVER_ERROR", message: "Could not reach the server.", requestId: "r1", details: {} } }),
      )
      .mockResolvedValueOnce({ id: "u1", name: "Ada Lovelace", email: "ada@example.com" });

    const { findByText, getByLabelText } = await render(<HomeScreen onLoggedOut={jest.fn()} />);
    expect(await findByText("Could not reach the server.")).toBeTruthy();

    await fireEvent.press(getByLabelText("Try again"));
    expect(await findByText("Welcome, Ada Lovelace")).toBeTruthy();
    expect(usersApi.me).toHaveBeenCalledTimes(2);
  });

  it("logging out clears the session and calls the logout endpoint with the refresh token", async () => {
    (session.getAccessToken as jest.Mock).mockResolvedValue("access-1");
    (session.getRefreshToken as jest.Mock).mockResolvedValue("refresh-1");
    (usersApi.me as jest.Mock).mockResolvedValue({ id: "u1", name: "Ada", email: "ada@example.com" });
    const onLoggedOut = jest.fn();

    const { findByText, getByLabelText } = await render(<HomeScreen onLoggedOut={onLoggedOut} />);
    await findByText("Welcome, Ada");

    await fireEvent.press(getByLabelText("Log out"));

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledWith("refresh-1");
      expect(session.clear).toHaveBeenCalled();
      expect(onLoggedOut).toHaveBeenCalled();
    });
  });
});
