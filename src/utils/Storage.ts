// Tauri api
import { Stronghold, Location } from "tauri-plugin-stronghold-api/webview-dist";

const stronghold = new Stronghold(".config", "password");
const location = Location.generic("vault", "record");
const clientPath = "sparus";

export const Save = async (key: string, value: string) => {
  const client = await getClient();
  const store = client.getStore();
  await store.insert(key, Array.from(new TextEncoder().encode(value)));
  await stronghold.save();
};

export const Load = async (key: string) =>
  new Promise<string>((resolve, reject) => {
    const client = await getClient();
    const store = client.getStore();
    store
      .get(key)
      .then((value: any) => new TextDecoder().decode(new Uint8Array(value)))
      .then((value: any) => resolve(value))
      .catch((error: any) => reject(error));
  });

const getClient = async () => {
  try {
    return await stronghold.loadClient(clientPath);
  } catch {
    return await stronghold.createClient(clientPath);
  }
};
