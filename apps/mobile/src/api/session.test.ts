import * as SecureStore from "expo-secure-store";
import { session } from "./session";

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("session", () => {
  afterEach(() => {
    jest.resetAllMocks();
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

  it("serializes overlapping saves and clears", async () => {
    const events: string[] = [];
    let releaseFirstSave!: () => void;
    let firstSaveStarted!: () => void;
    const firstSaveReady = new Promise<void>((resolve) => {
      firstSaveStarted = resolve;
    });
    const firstSaveReleased = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });

    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key, value) => {
      events.push(`set:${key}:${value}`);
      if (value === "access-old") {
        firstSaveStarted();
        await firstSaveReleased;
      }
    });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key) => {
      events.push(`delete:${key}`);
    });

    const staleSave = session.save("access-old", "refresh-old");
    await firstSaveReady;
    const clear = session.clear();
    const currentSave = session.save("access-new", "refresh-new");

    expect(events).toEqual(["set:ai_commerce_access_token:access-old"]);
    releaseFirstSave();
    await Promise.all([staleSave, clear, currentSave]);

    expect(events).toEqual([
      "set:ai_commerce_access_token:access-old",
      "set:ai_commerce_refresh_token:refresh-old",
      "delete:ai_commerce_access_token",
      "delete:ai_commerce_refresh_token",
      "set:ai_commerce_access_token:access-new",
      "set:ai_commerce_refresh_token:refresh-new",
    ]);
  });

  it("returns null when no session has been saved yet", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    await expect(session.getAccessToken()).resolves.toBeNull();
  });
});
