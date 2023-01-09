// Tauri api
import { Stronghold } from "tauri-plugin-stronghold-api";

const stronghold = new Stronghold(".config", "password");
const clientPath = "sparus";

const getClient = async () =>
  stronghold
    .loadClient(clientPath)
    .catch(() => stronghold.createClient(clientPath));

export const Save = async (key: string, value: string) => {
  const client = await getClient();
  const store = client.getStore();
  await store.insert(key, Array.from(new TextEncoder().encode(value)));
  await stronghold.save();
};

export const Load = (key: string) =>
  new Promise<string>((resolve, reject) => {
    getClient().then((client) => {
      const store = client.getStore();
      store
        .get(key)
        .then((value: Uint8Array) =>
          resolve(new TextDecoder().decode(new Uint8Array(value)))
        )
        .catch((error: string) => reject(error));
    });
  });
