// core/git/httpTransport.ts
// Custom HTTP transport for isomorphic-git.
// Injects JWT or scan token auth into Git Smart HTTP requests.
// Points all operations at the limbo.health mgit-api gateway.

// --- Auth Config ---
import type {
  GitHttpRequest,
  GitHttpResponse,
} from 'isomorphic-git';

export type AuthConfig =
  | { type: 'jwt'; token: string }
  | { type: 'scanToken'; token: string };

// --- isomorphic-git HTTP plugin interface ---

// interface GitHttpRequest {
//   url: string;
//   method: string;
//   headers: Record<string, string>;
//   body?: AsyncIterableIterator<Uint8Array>;
// }

// interface GitHttpResponse {
//   url: string;
//   method: string;
//   statusCode: number;
//   statusMessage: string;
//   headers: Record<string, string>;
//   body?: Uint8Array[];
// }

// --- Transport Factory ---

/**
 * Create an HTTP transport for isomorphic-git that injects auth
 * and routes requests through the limbo.health mgit-api gateway.
 *
 * Usage with isomorphic-git:
 *   const http = createHttpTransport({ type: 'jwt', token: myJwt });
 *   await git.clone({ ..., http });
 */
export function createHttpTransport(auth: AuthConfig) {
  return {
    async request(config: GitHttpRequest): Promise<GitHttpResponse> {
      let url = config.url;
      const headers: Record<string, string> = { ...config.headers };

      // Inject auth
      if (auth.type === 'jwt') {
        headers['Authorization'] = `Bearer ${auth.token}`;
      } else if (auth.type === 'scanToken') {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}scan_token=${auth.token}`;
      }

      // Collect request body from async iterator into a single Uint8Array
      let bodyBytes: Uint8Array | undefined;
      if (config.body) {
        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        for await (const chunk of config.body) {
          chunks.push(chunk);
          totalLen += chunk.length;
        }
        bodyBytes = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          bodyBytes.set(chunk, offset);
          offset += chunk.length;
        }
      }

      // Execute fetch
      const res = await fetch(url, {
        method: config.method || 'GET',
        headers,
        body: bodyBytes ? new Uint8Array(bodyBytes).buffer as ArrayBuffer : undefined,
      });

      // Read response body as ArrayBuffer → Uint8Array
      const responseBuffer = await res.arrayBuffer();
      const responseBytes = new Uint8Array(responseBuffer);

      // Parse response headers into plain object
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        url: res.url,
        method: config.method,
        statusCode: res.status,
        statusMessage: res.statusText,
        headers: responseHeaders,
        body: (async function* () {
          yield responseBytes;
        })(),
      };
    },
  };
}