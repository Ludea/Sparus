import React, { ReactNode, useEffect, useState, useContext } from "react";
import ReactDOM from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { createInstance, ModuleFederation } from "@module-federation/runtime";
import { PluginsProvider, usePluginsContext } from "utils/usePlugins";
import { SparusErrorContext } from "utils/Context";
import { Plugins } from "components/Plugins";

const PluginLoader: React.FC = () => {
  const [pluginPath, setPluginsPath] = useState<string[]>([]);
  const [mf, setMF] = useState<ModuleFederation>();
  const { register } = usePluginsContext();

  const { setGlobalError } = useContext(SparusErrorContext);

  useEffect(() => {
    invoke<string[]>("js_plugins_path")
      .then((path) => setPluginsPath(path))
      .catch((err) => setGlobalError(err));

    let instance = createInstance({
      name: "host",
      remotes: [],
    });

    instance.registerShared({
      react: {
        version: React.version,
        scope: "default",
        lib: () => React,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${React.version}`,
        },
      },
      "react-dom": {
        version: ReactDOM.version || React.version,
        scope: "default",
        lib: () => ReactDOM,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${ReactDOM.version || React.version}`,
        },
      },
    });

    setMF(instance);
  }, []);

  if (!mf) return null;
  return (
    <div style={{ display: "none" }}>
      {pluginPath.map((path) => (
        <Plugins key={path} path={path} register={register} mf={mf} />
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
