import { ModuleFederation } from "@module-federation/runtime";
import { useState, useEffect, useContext, FC, ReactElement } from "react";
import { SparusErrorContext } from "utils/Context";

type PluginPosition = "header" | "body" | "footer";

type PluginsProps = {
  path: string;
  register: (pos: PluginPosition, el: ReactElement) => void;
};

export const Plugins = ({ path, register, mf }: PluginsProps & { mf: ModuleFederation }) => {
  const { setGlobalError } = useContext(SparusErrorContext);
  const [Comp, setComponent] = useState<FC<{
    register: typeof register;
  }> | null>(null);

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
      .then((mod) => setComponent(() => mod.default))
      .catch((err: unknown) => {
        setGlobalError(err);
      });
  }, [path]);

  if (!Comp) return null;
  return <Comp register={register} />;
};
