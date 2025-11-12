import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plugins } from "components/Plugins";
import { PluginsContext, usePluginsState } from "usePlugins";

export const PluginManager: React.FC = () => {
  const [pluginPaths, setPluginPaths] = useState<string[]>([]);
  const pluginsState = usePluginsState();

  useEffect(() => {
    invoke<string[]>("js_plugins_path")
      .then(setPluginPaths)
      .catch(console.error);
  }, []);

  return (
    <PluginsContext.Provider value={pluginsState}>
      <div style={{ display: "none" }}>
        {pluginPaths.map((path) => (
          <Plugins key={path} path={path} register={pluginsState.register} />
        ))}
      </div>
    </PluginsContext.Provider>
  );
};
