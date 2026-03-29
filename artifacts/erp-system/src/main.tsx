import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const TOKEN_KEY = "erp_auth_token";
setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

createRoot(document.getElementById("root")!).render(<App />);
