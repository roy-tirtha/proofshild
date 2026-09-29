import { vercelAuthHandler } from '../../../server/vercel-auth-handler.js';

export const config = { api: { bodyParser: false } };

export default vercelAuthHandler;
