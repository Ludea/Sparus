import Footer from "components/Footer";
import { PluginSlot } from "utils/usePlugins";

function Index() {
  return (
    <>
      <PluginSlot position="body" />
      <Footer />
    </>
  );
}

export default Index;
