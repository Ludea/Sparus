import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plugins } from "components/Plugins";

export const PluginManager: React.FC = () => {
  const [plugins, setPlugins] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("js_plugins_path")
      .then((plugin: string[]) => {
        setPlugins(plugin);
      })
      .catch((err: unknown) => {
        console.log(err);
      });
  }, []);

  return (
    <div>
      {plugins.map((plugin) => (
        <Plugins key={plugin} path={plugin} />
      ))}
    </div>
  );
};
