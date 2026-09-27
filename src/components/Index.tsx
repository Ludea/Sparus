import Box from "@mui/material/Box";
import Footer from "components/Footer";
import { PluginSlot } from "utils/usePlugins";

function Index() {
  return (
    <>
      {/* Positioned container: plugin coords are offsets inside the body area */}
      <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
        <PluginSlot position="body" />
      </Box>
      <Footer />
    </>
  );
}

export default Index;
