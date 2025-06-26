import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/GUESS-THE-KILLER/",  //  <-- repo name with trailing slash
  plugins: [react()],
});
