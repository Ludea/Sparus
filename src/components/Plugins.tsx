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
    let cancelled = false;

    // Load the plugin's bundle straight from the filesystem
    // ($APPDATA/plugins/<path>/frontend.js) through Tauri's asset protocol
    // instead of a remote HTTP server.
    appDataDir()
      .then((dir) => join(dir, "plugins", path, "frontend.js"))
      .then((file) => {
        // registerRemotes is idempotent for an already-registered name
        // (silent no-op without `force`), so re-running this effect is safe.
        mf.registerRemotes([{ name: path, type: "module", entry: convertFileSrc(file) }]);
        return mf.loadRemote(`${path}/Button`);
      })
      .then((mod) => {
        if (cancelled) return;
        if (!isRemoteModule(mod)) {
          setGlobalError(`plugin "${path}" is invalid (no default export)`);
          return;
        }
        setComponent(() => mod.default);
      })
      .catch((err: unknown) => {
        if (!cancelled) setGlobalError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [path, mf]);

  if (!Comp) return null;
  return <Comp register={register} setError={setGlobalError} />;
};
