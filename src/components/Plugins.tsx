import { useState, FC, useEffect } from "react";

export const Plugins = ({ path }: { path: string }) => {
  const [Comp, setComponent] = useState<FC>();

  useEffect(() => {
    const base_url = "http://localhost:8012/plugins/";
    import(/* @vite-ignore */ base_url + path)
      .then((mod) => {
        /* eslint-disable-next-line 
           @typescript-eslint/no-unsafe-return, 
           @typescript-eslint/no-unsafe-member-access */
        setComponent(() => mod.default);
      })
      .catch((err: unknown) => {
        console.log(err);
      });
  }, [path]);

  if (!Comp) return null;
  return <Comp />;
};
