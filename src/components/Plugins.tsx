import { useState, FC, useEffect } from "react";
import type { ReactElement } from "react";
import type { PluginPosition } from "usePlugins";

interface LoadedPluginProps {
  register: (position: PluginPosition, element: ReactElement) => void;
}

export const Plugins = ({
  path,
  register,
}: {
  path: string;
  register: LoadedPluginProps["register"];
}) => {
  const [Comp, setComponent] = useState<FC<LoadedPluginProps>>();

  useEffect(() => {
    const base_url = "http://localhost:8012/plugins/";
    import(/* @vite-ignore */ base_url + path)
      .then((mod) => {
        /* eslint-disable-next-line 
           @typescript-eslint/no-unsafe-return, 
           @typescript-eslint/no-unsafe-member-access */
        setComponent(() => mod.default);
      })
      .catch(console.error);
  }, [path]);

  if (!Comp) return null;

  return <Comp register={register} />;
};
