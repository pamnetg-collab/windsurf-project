import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Mini App dev server proxies /api to the backend.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        proxy: {
            "/api": {
                target: "http://localhost:4000",
                changeOrigin: true,
            },
        },
    },
});
