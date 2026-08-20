import * as SecureStore from "expo-secure-store";
import { session } from "./session";

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("session", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("save writes both tokens to SecureStore, not AsyncStorage or plain state", async () => {
    await session.save("access-1", "refresh-1");

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("ai_commerce_access_token", "access-1");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("ai_commerce_refresh_token", "refresh-1");
  });

  it("getAccessToken/getRefreshToken read from SecureStore by their exact keys", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce("access-1");
    await expect(session.getAccessToken()).resolves.toBe("access-1");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("ai_commerce_access_token");

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce("refresh-1");
    await expect(session.getRefreshToken()).resolves.toBe("refresh-1");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("ai_commerce_refresh_token");
  });

  it("clear deletes both tokens", async () => {
    await session.clear();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("ai_commerce_access_token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("ai_commerce_refresh_token");
  });

  it("returns null when no session has been saved yet", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    await expect(session.getAccessToken()).resolves.toBeNull();
  });
});
