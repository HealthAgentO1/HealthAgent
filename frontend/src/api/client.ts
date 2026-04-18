import axios from "axios";
import { refreshAccessToken } from "./auth";
import { clearAuthSession, getAccessToken } from "./authStorage";

const baseURL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as typeof error.config & {
      _retry?: boolean;
    };
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      original.url?.includes("/token/")
    ) {
      return Promise.reject(error);
    }

    original._retry = true;
    const newAccess = await refreshAccessToken();
    if (!newAccess) {
      clearAuthSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
    if (original.headers) {
      original.headers.Authorization = `Bearer ${newAccess}`;
    }
    return apiClient(original);
  },
);
