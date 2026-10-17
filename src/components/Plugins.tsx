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

const DEV_PLUGIN_ENTRY = "http://localhost:3000/frontend.js";
const DEV_POLL_INTERVAL_MS = 1000;

// Bundler-agnostic change token: ETag/Last-Modified, falling back to the body length.
async function fetchEntryToken(entry: string): Promise<string> {
  const res = await fetch(entry, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const etag = res.headers.get("ETag") ?? res.headers.get("Last-Modified");
  if (etag) return etag;
  return `len:${(await res.text()).length}`;
}

function isRemoteModule(mod: unknown): mod is RemoteModule {
  return typeof mod === "object" && mod != null && "default" in mod;
}

export const Plugins = ({ path, register, mf }: PluginsManagerProps & { mf: ModuleFederation }) => {
  const { setGlobalError } = useContext(SparusErrorContext);
  const [Comp, setComponent] = useState<ComponentType<PluginsProps> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPlugin = (entry: string) => {
      const versionedEntry = `${entry}?v=${Date.now()}`;
      mf.registerRemotes([{ name: "button", type: "module", entry: versionedEntry }], {
        force: true,
      });
      mf.loadRemote("button/Button")
        .then((mod: unknown) => {
          if (cancelled) return;
          if (!isRemoteModule(mod)) {
            setGlobalError({
              kind: "plugin",
              message: `plugin "${path}" is invalid (no default export)`,
            });
            return;
          }
          setComponent(() => mod.default);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setGlobalError({
            kind: "plugin",
            message: err.message,
          });
        });
    };

    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    // Dev only: remount the plugin when the dev server's bundle changes (no state-preserving Fast Refresh).
    const watchPlugin = (entry: string) => {
      let lastToken: string | undefined;
      const tick = async () => {
        try {
          const token = await fetchEntryToken(entry);
          if (cancelled) return;
          if (lastToken !== undefined && token !== lastToken) loadPlugin(entry);
          lastToken = token;
        } catch {
          // dev server down or restarting: keep the last token and retry
        }
        if (!cancelled) pollTimer = setTimeout(tick, DEV_POLL_INTERVAL_MS);
      };
      tick();
    };

    if (import.meta.env.DEV) {
      loadPlugin(DEV_PLUGIN_ENTRY);
      watchPlugin(DEV_PLUGIN_ENTRY);
    } else {
      appDataDir()
        .then((dir) => join(dir, "plugins", path, "frontend.js"))
        .then((file) => {
          if (!cancelled) loadPlugin(convertFileSrc(file));
        })
        .catch((err) => {
          if (!cancelled)
            setGlobalError({
              kind: "plugin",
              message: err.message,
            });
        });
    }

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [path, mf]);

  if (!Comp) return null;
  return <Comp register={register} setError={setGlobalError} />;
};
