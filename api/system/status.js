import { getAuthConfig } from '../../server/auth.js';

export default function handler(_request, response) {
  response.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), auth: getAuthConfig() });
}
