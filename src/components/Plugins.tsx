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

    const loadPlugin = (entry: string) => {
      // Cache-bust the bundle URL so an updated frontend.js is fetched fresh
      // instead of served stale from the webview cache (#1037). `force` lets the
      // new entry replace a previously-registered remote of the same name.
      const versionedEntry = `${entry}?v=${Date.now()}`;
      mf.registerRemotes([{ name: "button", type: "module", entry: versionedEntry }], {
        force: true,
      });
      mf.loadRemote(`button/Button`)
        .then((mod: unknown) => {
          if (cancelled) return;
          if (!isRemoteModule(mod)) {
            setGlobalError(`plugin "${path}" is invalid (no default export)`);
            return;
          }
          setComponent(() => mod.default);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          if (!(err instanceof TypeError) && !err.message.includes("Failed to fetch")) {
            setGlobalError(err);
          }
        });
    };

    if (import.meta.env.DEV) {
      loadPlugin("http://localhost:3002/frontend.js");
    } else {
      // Resolve the on-disk bundle path FIRST, then load. The previous code set
      // `url` inside an async `.then()` but called registerRemotes synchronously,
      // so in production the remote was registered with an empty entry and never
      // loaded.
      appDataDir()
        .then((dir) => join(dir, "plugins", path, "frontend.js"))
        .then((file) => {
          if (!cancelled) loadPlugin(convertFileSrc(file));
        })
        .catch((err) => {
          if (!cancelled) setGlobalError(err);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [path, mf]);

  if (!Comp) return null;
  return <Comp register={register} setError={setGlobalError} />;
};
