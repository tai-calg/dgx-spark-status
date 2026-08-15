import {
  getDashboardToken,
  isBasicAuthorized,
  requestRequiresAuthentication
} from '$lib/server/security.js';

const AUTH_REALM = 'DGX Spark Status';

function unauthorizedResponse() {
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${AUTH_REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store'
    }
  });
}

function remoteAccessMisconfiguredResponse() {
  return new Response('Remote access is not configured securely.', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export const handle = async ({ event, resolve }) => {
  let clientAddress = '';
  try {
    clientAddress = event.getClientAddress();
  } catch {
    // Some adapters cannot expose the peer address. The hostname check below still fails closed for remote URLs.
  }

  const requiresAuth = requestRequiresAuthentication({
    clientAddress,
    hostname: event.url.hostname
  });

  if (requiresAuth) {
    if (getDashboardToken().length < 16) return remoteAccessMisconfiguredResponse();
    if (!isBasicAuthorized(event.request)) return unauthorizedResponse();
  }

  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};
