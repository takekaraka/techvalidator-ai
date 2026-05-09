/**
 * Configuración del servidor.
 * Las API keys DEBEN estar en variables de entorno (nunca hardcodeadas).
 * En Render: Dashboard → Environment → Add Variable
 */
export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  RAPIDAPI_KEY:   process.env.RAPIDAPI_KEY   || ''
};

export function validateConfig() {
  if (!CONFIG.GEMINI_API_KEY) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  FALTA GEMINI_API_KEY                            ║');
    console.error('║                                                      ║');
    console.error('║  1. Ve a: https://aistudio.google.com/app/apikey     ║');
    console.error('║  2. Crea una nueva API Key                           ║');
    console.error('║  3. En Render: Dashboard → Environment → Add         ║');
    console.error('║     GEMINI_API_KEY = tu_nueva_key                    ║');
    console.error('╚══════════════════════════════════════════════════════╝');
    console.error('');
    return false;
  }
  return true;
}
