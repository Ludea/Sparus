import { ReactNode, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plugins } from "components/Plugins";
import { PluginsProvider, usePluginsContext } from "usePlugins";

const PluginLoader: React.FC = () => {
  const [pluginPaths, setPluginPaths] = useState<string[]>([]);
  const { register } = usePluginsContext();

  useEffect(() => {
    invoke<string[]>("js_plugins_path")
      .then(setPluginPaths)
      .catch(console.error);
  }, []);

  return (
    <div style={{ display: "none" }}>
      {pluginPaths.map((path) => (
        <Plugins key={path} path={path} register={register} />
      ))}
    </div>
  );
};

export const PluginManager = ({ children }: { children: ReactNode }) => {
  return (
    <PluginsProvider>
      <PluginLoader />
      {children}
    </PluginsProvider>
  );
};
