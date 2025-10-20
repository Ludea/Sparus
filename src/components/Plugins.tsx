import { convertFileSrc } from "@tauri-apps/api/core";
import {
  useState,
  useEffect,
  Suspense,
  lazy,
  LazyExoticComponent,
  ComponentType,
} from "react";

export const Plugins = ({ path }: { path: string }) => {
  const [Comp, setComponent] =
    useState<LazyExoticComponent<ComponentType> | null>(null);

  useEffect(() => {
    const url = convertFileSrc(path);
    const Lazycomponent = lazy(() =>
      import(/* @vite-ignore */ url).catch((err: unknown) => {
        console.log(err);
      }),
    );
    setComponent(() => Lazycomponent);
  }, [path]);

  if (!Comp) return <p>Loading component</p>;
  return (
    <Suspense fallback={<p>Plugin Initialisation ! </p>}>
      <Comp />
    </Suspense>
  );
};
