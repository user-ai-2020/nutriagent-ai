import type { Server } from "node:http";

/** Minimal shape of what we need from an Express app — avoids depending on express here. */
interface ListenableApp {
  listen(port: number, callback?: () => void): Server;
}

export interface StartServerOptions {
  /** Attempts before giving up. Each retry waits `retryDelayMs`. */
  maxRetries?: number;
  retryDelayMs?: number;
  /** Called once the server is listening. */
  onListening?: (port: number) => void;
}

/**
 * Start an HTTP server, tolerating a port that is briefly still held.
 *
 * `app.listen()` emits an `'error'` event; with no listener attached Node treats
 * it as an unhandled error and kills the process. In watch mode that is fatal and
 * permanent: a file change restarts a service before the previous process has
 * released its socket, the new one hits EADDRINUSE, and the service stays down
 * until the whole dev stack is restarted by hand.
 *
 * EADDRINUSE from a restart clears in well under a second, so retry briefly
 * before failing — and when it is genuinely occupied by another program, exit
 * with a message that says so instead of a stack trace.
 */
export function startServer(
  app: ListenableApp,
  port: number,
  serviceName: string,
  options: StartServerOptions = {}
): void {
  const maxRetries = options.maxRetries ?? 10;
  const retryDelayMs = options.retryDelayMs ?? 400;

  let attempt = 0;

  const tryListen = () => {
    const server = app.listen(port, () => {
      if (options.onListening) options.onListening(port);
      else console.log(`${serviceName} on http://localhost:${port}`);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EADDRINUSE") {
        console.error(`${serviceName}: server error`, err);
        process.exit(1);
      }

      attempt += 1;
      if (attempt > maxRetries) {
        console.error(
          `${serviceName}: port ${port} is still in use after ${maxRetries} attempts. ` +
            `Another process is holding it — stop it (Windows: ` +
            `Get-NetTCPConnection -LocalPort ${port} -State Listen) and try again.`
        );
        process.exit(1);
      }

      console.warn(
        `${serviceName}: port ${port} busy (likely a restarting instance), ` +
          `retry ${attempt}/${maxRetries} in ${retryDelayMs}ms…`
      );
      setTimeout(tryListen, retryDelayMs);
    });
  };

  tryListen();
}
