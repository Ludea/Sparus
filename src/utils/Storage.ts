import { Stronghold } from "tauri-plugin-stronghold";

const clientPath = "sparus";

const getClient = async (stronghold: Stronghold) =>
  stronghold
    .loadClient(clientPath)
    .catch(() => stronghold.createClient(clientPath));

export const Save = async (stronghold: Stronghold, key: string, value: string) => {
  const client = await getClient(stronghold);
  const store = client.getStore();
  await store.insert(key, Array.from(new TextEncoder().encode(value)));
  await stronghold.save();
  await stronghold.unload();
};

export const Load = async (stronghold: Stronghold, key: string) =>
  new Promise<string>((resolve, reject) => {
    getClient(stronghold).then((client) => {
      const store = client.getStore();
      store
        .get(key)
        .then((value: Uint8Array) =>
          resolve(new TextDecoder().decode(new Uint8Array(value)))
        )
        .catch((error: string) => {
          stronghold.unload().then(() => {}).catch(()=> {});
          reject(error)
        })
    })
    .catch((error: string) => reject(error));
  });
