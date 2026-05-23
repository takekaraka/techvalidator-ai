// Persistencia mínima: reglas guardadas, historial de clasificaciones, feedback de usuario.
// JSON en disco. Suficiente para una sola cuenta personal.

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const RULES_FILE = path.join(DATA_DIR, 'mail-rules.json');
const HISTORY_FILE = path.join(DATA_DIR, 'mail-history.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RULES_FILE)) fs.writeFileSync(RULES_FILE, '[]');
  if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]');
}

export function listRules() {
  ensure();
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
}

export function saveRule(rule) {
  ensure();
  const rules = listRules();
  const id = rule.id || `rule_${Date.now()}`;
  const next = rules.filter((r) => r.id !== id).concat({ ...rule, id, updated_at: new Date().toISOString() });
  fs.writeFileSync(RULES_FILE, JSON.stringify(next, null, 2));
  return next.find((r) => r.id === id);
}

export function deleteRule(id) {
  ensure();
  const rules = listRules().filter((r) => r.id !== id);
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

export function appendHistory(entry) {
  ensure();
  const hist = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  hist.push({ ...entry, at: new Date().toISOString() });
  // Cap a últimos 500.
  const capped = hist.slice(-500);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(capped, null, 2));
}

export function getHistory() {
  ensure();
  return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')).reverse();
}
