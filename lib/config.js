/**
 * Configuración de respaldo para el servidor.
 * Si no hay variables de entorno (Render), usamos estas.
 */
export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AIzaSyDIgn8ROdq4gwQxy-bquQ3nBQvi9LAeuis',
  RAPIDAPI_KEY:   process.env.RAPIDAPI_KEY   || 'd811aac32amsh78f4962a3135bccp1ee5f3jsn7b857a756101'
};
