import { Stronghold, Client } from "tauri-plugin-stronghold-api";
import { appDataDir } from "@tauri-apps/api/path";

export const initStronghold = async () => {
  const vaultPath = `${await appDataDir()}/.sparus.vault`;

  const vaultKey = "The key to the vault";

  const stronghold = await Stronghold.load(vaultPath, vaultKey);

  const clientName = "sparus";

  const client: Client = await stronghold
    .loadClient(clientName)
    .catch(async () =>
      stronghold.createClient(clientName).catch((err: string) => {
        throw new Error(err);
      }),
    );

  return {
    stronghold,
    client,
  };
};

export const Save = async (client: Client, key: string, value: string) => {
  const store = client.getStore();
  await store
    .insert(key, Array.from(new TextEncoder().encode(value)))
    .catch((err: string) => {
      throw new Error(err);
    });
};

export const Load = (client: Client, key: string) => {
  const store = client.getStore();
  store
    .get(key)
    .then((value) => {
      if (value) new TextDecoder().decode(new Uint8Array(value));
    })
    .catch((err: string) => {
      throw new Error(err);
    });
};
