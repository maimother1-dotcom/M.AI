/**
 * The server. Deliberately `node:http` with no framework: this process holds
 * money and phone numbers, and every dependency added here is a dependency
 * that has to be trusted, patched and audited forever. The routing this API
 * needs is nine exact paths.
 */
import { createServer, type Server } from 'node:http';
import { handle } from './router';
import type { Deps } from './types';

export function createApp(deps: Deps): Server {
  const server = createServer((req, res) => {
    void handle(req, res, deps).catch(() => {
      // handle() converts everything to a response; this is belt and braces so
      // a bug in the error path cannot leave a socket hanging open.
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('{"error":"internal_error"}');
      }
    });
  });

  // A slow-loris connection costs us a socket and nothing else, but there is no
  // reason to leave the door open.
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  return server;
}

export type { Deps };
