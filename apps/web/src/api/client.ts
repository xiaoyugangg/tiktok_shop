import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err?.response?.data?.message ?? err?.message ?? 'request failed';
    return Promise.reject(new Error(message));
  },
);
