import Footer from "components/Footer";

// Tauri api
import { platform } from "@tauri-apps/plugin-os";

function Index() {
  return platform() !== "android" || platform() !== "ios" ? <Footer /> : null;
}

export default Index;
