import { ModuleFederation } from "@module-federation/runtime";
import { useState, useEffect, useContext, ReactElement, ComponentType } from "react";
import { SparusErrorContext } from "utils/Context";

type PluginPosition = "header" | "body" | "footer";

type PluginsProps = {
  path: string;
  register: (pos: PluginPosition, el: ReactElement) => void;
};

type RemoteModule = {
  default: ComponentType<PluginsProps>;
};

function isRemoteModule(mod: unknown): mod is RemoteModule {
  return typeof mod === "object" && mod != null && "default" in mod;
}

export const Plugins = ({ path, register, mf }: PluginsProps & { mf: ModuleFederation }) => {
  const { setGlobalError } = useContext(SparusErrorContext);
  const [Comp, setComponent] = useState<ComponentType<PluginsProps> | null>(null);

  useEffect(() => {
    const base_url = "http://localhost:8012/plugins/";
    mf.registerRemotes([
      {
        name: path,
        type: "module",
        entry: base_url + path + "/frontend.js",
      },
    ]);

    mf.loadRemote(path + "/Button")
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
  return <Comp register={register} setError={setError} />;
};
