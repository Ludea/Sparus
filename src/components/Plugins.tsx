import { ModuleFederation } from "@module-federation/runtime";
import { useState, useEffect, useContext, ReactElement, ComponentType } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { SparusErrorContext } from "utils/Context";

type PluginPosition = "header" | "body" | "footer";

type PluginsManagerProps = {
  path: string;
  register: (pos: PluginPosition, el: ReactElement) => void;
};

type PluginsProps = {
  register: (pos: PluginPosition, el: ReactElement) => void;
  setError: (err: unknown) => void;
};

type RemoteModule = {
  default: ComponentType<PluginsProps>;
};

function isRemoteModule(mod: unknown): mod is RemoteModule {
  return typeof mod === "object" && mod != null && "default" in mod;
}

export const Plugins = ({ path, register, mf }: PluginsManagerProps & { mf: ModuleFederation }) => {
  const { setGlobalError } = useContext(SparusErrorContext);
  const [Comp, setComponent] = useState<ComponentType<PluginsProps> | null>(null);

  useEffect(() => {
    let url: string = "";
    if (import.meta.env.DEV) {
      url = `http://localhost:3002/frontend.js`;
    } else {
      // Load the plugin's bundle straight from the filesystem
      // ($APPDATA/plugins/<path>/frontend.js) through Tauri's asset protocol
      // instead of a remote HTTP server.
      appDataDir()
        .then((dir) => join(dir, "plugins", path, "frontend.js"))
        .then((file) => {
          // registerRemotes is idempotent for an already-registered name
          // (silent no-op without `force`), so re-running this effect is safe.
          url = convertFileSrc(file);
        })
        .catch((err) => {
          setGlobalError(err);
        });
    }
    mf.registerRemotes([{ name: "button", type: "module", entry: url }]);
    mf.loadRemote(`button/Button`)
      .then((mod: unknown) => {
        if (!isRemoteModule(mod)) {
          setGlobalError(`plugin "${path}" is invalid (no default export)`);
          return;
        }
        setComponent(() => mod.default);
      })
      .catch((err: Error) => {
        if (!(err instanceof TypeError) && !err.message.includes("Failed to fetch")) {
          setGlobalError(err);
        }
      });
  }, [path, mf]);

  if (!Comp) return null;
  return <Comp register={register} setError={setGlobalError} />;
};
