/**
 * Must be imported before any other server module that reads process.env from .env files.
 */
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
dotenv.config({ path: join(projectRoot, '.env') });
dotenv.config({ path: join(projectRoot, '.env.local'), override: true });
