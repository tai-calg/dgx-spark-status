import { timingSafeEqual } from 'node:crypto';

const DEFAULT_PORT = 9000;
const MIN_TOKEN_LENGTH = 16;

export function remoteAccessEnabled(env = process.env) {
  return env.DGX_ALLOW_REMOTE === '1';
}

export function getServerHost(env = process.env) {
  return remoteAccessEnabled(env) ? '0.0.0.0' : '127.0.0.1';
}

export function getServerPort(env = process.env) {
  const value = Number.parseInt(env.DGX_PORT || '', 10);
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : DEFAULT_PORT;
}

export function getDashboardToken(env = process.env) {
  return env.DGX_DASHBOARD_TOKEN || '';
}

export function assertSecureRemoteConfig(env = process.env) {
  if (remoteAccessEnabled(env) && getDashboardToken(env).length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `DGX_ALLOW_REMOTE=1 requires DGX_DASHBOARD_TOKEN with at least ${MIN_TOKEN_LENGTH} characters.`
    );
  }
}

export function isLoopbackAddress(address) {
  if (!address) return false;
  let normalized = address.trim().toLowerCase();
  if (normalized.startsWith('::ffff:')) normalized = normalized.slice(7);
  return normalized === '::1' || normalized === 'localhost' || normalized.startsWith('127.');
}

export function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const normalized = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.');
}

export function requestRequiresAuthentication({ clientAddress = '', hostname = '', env = process.env } = {}) {
  if (remoteAccessEnabled(env)) return true;
  if (clientAddress && !isLoopbackAddress(clientAddress)) return true;
  if (hostname && !isLoopbackHostname(hostname)) return true;
  return false;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isBasicAuthorized(request, env = process.env) {
  const expectedToken = getDashboardToken(env);
  if (expectedToken.length < MIN_TOKEN_LENGTH) return false;

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === 'dgx' && constantTimeEqual(password, expectedToken);
  } catch {
    return false;
  }
}
