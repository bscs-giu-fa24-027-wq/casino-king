import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

let getToken = () => localStorage.getItem('accessToken');
let onUnauthorized = () => {};

export function setAxiosAuthHandlers({ tokenGetter, unauthorizedHandler } = {}) {
  if (tokenGetter) {
    getToken = tokenGetter;
  }

  if (unauthorizedHandler) {
    onUnauthorized = unauthorizedHandler;
  }
}

api.interceptors.request.use((config) => {
  const token = getToken?.();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      onUnauthorized?.();
    }

    if (status === 403) {
      const message = error.response?.data?.message || error.response?.data?.error || 'Access denied';
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
