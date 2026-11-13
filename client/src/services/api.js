import axios from 'axios';

const fallbackPorts = Array.from({ length: 12 }, (_, index) => `http://localhost:${5000 + index}/api`);
const configuredBase = import.meta.env.VITE_API_URL || '';
const candidateBases = [...new Set([configuredBase, ...fallbackPorts].filter(Boolean))];

const normalizeBase = (value = '') => (value.endsWith('/api') ? value : `${value.replace(/\/$/, '')}/api`);

const getOrderedCandidates = () => {
  const configuredBaseUrl = configuredBase ? normalizeBase(configuredBase) : '';
  const storedBase = localStorage.getItem('ridego_api_base');
  const normalizedStored = storedBase ? normalizeBase(storedBase) : '';
  const ordered = [];

  [configuredBaseUrl, normalizedStored, ...candidateBases].forEach((base) => {
    if (!base) return;
    const normalizedBase = normalizeBase(base);
    if (!ordered.includes(normalizedBase)) {
      ordered.push(normalizedBase);
    }
  });

  return ordered.length ? ordered : ['http://localhost:5008/api'];
};

export const resolveApiBase = async () => {
  const orderedCandidates = getOrderedCandidates();

  for (const base of orderedCandidates) {
    try {
      const healthResponse = await fetch(`${base.replace(/\/api$/, '')}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (healthResponse.ok) {
        localStorage.setItem('ridego_api_base', base);
        return base;
      }
    } catch (error) {
      // keep checking next candidate
    }
  }

  const fallbackBase = orderedCandidates[0];
  localStorage.setItem('ridego_api_base', fallbackBase);
  return fallbackBase;
};

const normalizeUrl = (baseUrl, requestUrl) => {
  if (!requestUrl) return baseUrl;
  if (requestUrl.startsWith('http')) return requestUrl;

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`;
  return `${normalizedBase}${normalizedPath}`;
};

const api = axios.create({
  baseURL: candidateBases[0] || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('ridego_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const base = api.defaults.baseURL || candidateBases[0] || 'http://localhost:5000/api';
  if (!config.url || config.url.startsWith('http')) {
    return config;
  }

  const resolvedBase = await resolveApiBase();
  api.defaults.baseURL = resolvedBase;
  config.baseURL = resolvedBase;
  config.url = normalizeUrl(resolvedBase, config.url);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    const orderedCandidates = getOrderedCandidates();
    const currentBase = api.defaults.baseURL || orderedCandidates[0] || 'http://localhost:5000/api';
    const currentIndex = orderedCandidates.indexOf(currentBase);

    if (currentIndex >= 0 && currentIndex < orderedCandidates.length - 1) {
      const nextBase = orderedCandidates[currentIndex + 1];
      originalRequest._retry = true;
      localStorage.setItem('ridego_api_base', nextBase);
      api.defaults.baseURL = nextBase;
      originalRequest.baseURL = nextBase;
      originalRequest.url = normalizeUrl(nextBase, originalRequest.url || '/');
      return axios(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
