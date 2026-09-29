import { auth } from '../../server/auth.js';

export function GET(request) {
  return auth.handler(request);
}

export function POST(request) {
  return auth.handler(request);
}
