import { useState, useEffect, FC, ReactElement } from "react";

export const Plugins = ({
  path,
  register,
}: {
  path: string;
  register: (pos: "header" | "body" | "footer", el: ReactElement) => void;
}) => {
  const [Comp, setComponent] = useState<FC<{
    register: typeof register;
  }> | null>(null);

  useEffect(() => {
    const base_url = "http://localhost:8012/plugins/";
    import(/* @vite-ignore */ base_url + path)
      /* eslint-disable-next-line 
           @typescript-eslint/no-unsafe-return, 
           @typescript-eslint/no-unsafe-member-access */
      .then((mod) => {
        setComponent(() => mod.default);
      })
      .catch(console.error);
  }, [path]);

  if (!Comp) return null;
  return <Comp register={register} />;
};
