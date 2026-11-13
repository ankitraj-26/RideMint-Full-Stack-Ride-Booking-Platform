import net from 'net';

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const tester = net.createConnection({ host: '127.0.0.1', port });

    tester.once('connect', () => {
      tester.destroy();
      resolve(false);
    });

    tester.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        resolve(true);
        return;
      }

      resolve(false);
    });
  });

export const findAvailablePort = async (preferredPort = 5000, maxAttempts = 20) => {
  let candidatePort = Number(preferredPort) || 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isAvailable = await isPortAvailable(candidatePort);

    if (isAvailable) {
      return candidatePort;
    }

    candidatePort += 1;
  }

  throw new Error(`Unable to find an available port starting from ${preferredPort}.`);
};
