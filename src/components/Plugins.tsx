import { ModuleFederation } from "@module-federation/runtime";
import { useState, useEffect, useContext, ReactElement, ComponentType } from "react";
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
  const [Comp, setComponent] = useState<ComponentType<any> | null>(null);

  useEffect(() => {
    const base_url = "http://localhost:3002/frontend.js";
    mf.registerRemotes([
      {
        name: "button",
        type: "module",
        entry: base_url,
      },
    ]);
    mf.loadRemote("button/Button")
      .then((mod) => {
        if (!isRemoteModule(mod)) {
          setGlobalError("invalid plugin");
          return;
        }
        setComponent(() => mod.default);
      })
      .catch((err: unknown) => {
        setGlobalError(err);
      });
  }, [path]);

  if (!Comp) return null;
  return <Comp />;
};
