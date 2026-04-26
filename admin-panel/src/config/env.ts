export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:3001'
    : 'https://your-backend-service.onrender.com');

export const FRONTEND_BASE_URL =
  import.meta.env.VITE_FRONTEND_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:3000'
    : 'https://your-frontend-service.onrender.com');
