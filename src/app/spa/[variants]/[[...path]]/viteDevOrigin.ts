const DEFAULT_VITE_DEV_HOST = 'localhost';
const DEFAULT_VITE_DEV_PORT = 9876;
export const VITE_DEV_PORT_ENV = 'SPA_DEV_PORT';

const isValidPort = (port: number) => Number.isInteger(port) && port > 0 && port <= 65_535;

export const resolveViteDevPort = (portValue = process.env[VITE_DEV_PORT_ENV]) => {
  const port = Number(portValue);

  return isValidPort(port) ? port : DEFAULT_VITE_DEV_PORT;
};

export const getViteDevOrigin = (portValue?: string) =>
  `http://${DEFAULT_VITE_DEV_HOST}:${resolveViteDevPort(portValue)}`;
