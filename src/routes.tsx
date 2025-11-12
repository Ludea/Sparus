import Index from "components/Index";
import Options from "components/Options";
import MobileIndex from "views/MobileIndex";

export const DesktopRoutes = () => [
  {
    path: "/",
    element: <Index />,
  },
  {
    path: "/options",
    element: <Options />,
  },
];

export const MobileRoutes = [
  {
    path: "/",
    element: <MobileIndex />,
  },
];
