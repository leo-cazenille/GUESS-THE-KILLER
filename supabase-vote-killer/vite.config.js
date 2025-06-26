import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/supabase-vote-killer/",  //  <-- repo name with trailing slash
  plugins: [react()],
});
