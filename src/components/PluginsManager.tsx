import React, { FC, ReactNode, useEffect, useState, useContext } from "react";
import ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactCompilerRuntime from "react/compiler-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as MuiMaterial from "@mui/material";
import muiMaterialPackage from "@mui/material/package.json";
import * as EmotionReact from "@emotion/react";
import emotionReactPackage from "@emotion/react/package.json";
import * as EmotionStyled from "@emotion/styled";
import emotionStyledPackage from "@emotion/styled/package.json";
import { invoke } from "@tauri-apps/api/core";
import { createInstance, ModuleFederation } from "@module-federation/runtime";
import { PluginsProvider, usePluginsContext } from "utils/usePlugins";
import { SparusErrorContext } from "utils/Context";
import { Plugins } from "components/Plugins";

const isDev = import.meta.env.DEV;

const PluginLoader: FC = () => {
  const [pluginPath, setPluginsPath] = useState<string[]>([]);
  const [mf, setMF] = useState<ModuleFederation>();
  const { register } = usePluginsContext();

  const { setGlobalError } = useContext(SparusErrorContext);

  useEffect(() => {
    if (!isDev) {
      invoke<string[]>("js_plugins_path")
        .then((path) => setPluginsPath(path))
        .catch((err) => setGlobalError(err));
    }

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
      "react/jsx-runtime": {
        version: React.version,
        scope: "default",
        lib: () => ReactJsxRuntime,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${React.version}`,
        },
      },
      "react/jsx-dev-runtime": {
        version: React.version,
        scope: "default",
        lib: () => ReactJsxDevRuntime,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${React.version}`,
        },
      },
      "react/compiler-runtime": {
        version: React.version,
        scope: "default",
        lib: () => ReactCompilerRuntime,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${React.version}`,
        },
      },
      "react-dom/client": {
        version: ReactDOM.version || React.version,
        scope: "default",
        lib: () => ReactDOMClient,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${ReactDOM.version || React.version}`,
        },
      },
      "@mui/material": {
        version: muiMaterialPackage.version,
        scope: "default",
        lib: () => MuiMaterial,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${muiMaterialPackage.version}`,
        },
      },
      "@emotion/react": {
        version: emotionReactPackage.version,
        scope: "default",
        lib: () => EmotionReact,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${emotionReactPackage.version}`,
        },
      },
      "@emotion/styled": {
        version: emotionStyledPackage.version,
        scope: "default",
        lib: () => EmotionStyled,
        shareConfig: {
          singleton: true,
          requiredVersion: `^${emotionStyledPackage.version}`,
        },
      },
    });

    setMF(instance);
  }, []);

  if (!mf) return null;
  return (
    <div style={{ display: "none" }}>
      {!isDev ? (
        pluginPath.map((path) => <Plugins key={path} path={path} register={register} mf={mf} />)
      ) : (
        <Plugins path="sparus" register={register} mf={mf} />
      )}
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
