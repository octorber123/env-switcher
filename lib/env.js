const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unquote = (v) => v.replace(/^(['"])(.*)\1$/, '$2');

function scan(text, key) {
  const re = new RegExp(`^(\\s*)(#\\s*)?${escapeRe(key)}\\s*=(.*)$`);
  return text
    .split('\n')
    .map((raw, index) => {
      const m = raw.replace(/\r$/, '').match(re);
      return m && { index, active: !m[2], value: unquote(m[3].trim()) };
    })
    .filter(Boolean);
}

function read(text, key) {
  const rows = scan(text, key);
  const active = rows.filter((r) => r.active).pop();
  return {
    current: active ? active.value : null,
    options: [...new Set(rows.map((r) => r.value).filter(Boolean))],
  };
}

function write(text, key, value) {
  const rows = scan(text, key);
  const target = rows.find((r) => r.active && r.value === value) || rows.find((r) => r.value === value);
  if (!target) return null;

  const lines = text.split('\n');
  for (const row of rows) {
    if (row.index === target.index) lines[row.index] = lines[row.index].replace(/^(\s*)#\s*/, '$1');
    else if (row.active) lines[row.index] = lines[row.index].replace(/^(\s*)/, '$1# ');
  }
  return lines.join('\n');
}

function group(texts, key) {
  const [first, ...rest] = texts.map((text) => read(text, key));
  const synced = rest.every((s) => s.current === first.current);
  return {
    synced,
    current: synced ? first.current : null,
    //ONLY OFFER VALUES EVERY LINKED FILE HAS, SO A SWITCH NEVER LEAVES ONE APP BEHIND
    options: first.options.filter((v) => rest.every((s) => s.options.includes(v))),
  };
}

module.exports = { read, write, group };
