export function normalizeSqliteQuery(source: string) {
  let query = source.trim().replace(/;$/, "");
  const ignoreConflict = /^INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(query);
  query = query.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\s+/i, "INSERT INTO ");
  query = query.replace(/json_extract\(([^,]+),\s*'\$\.([^']+)'\)/gi, (_match, value, key) => {
    const json = `(${String(value).trim()})::jsonb`;
    const direct = `${json} ->> '${key}'`;
    const decoded = `((${json} #>> '{}')::jsonb ->> '${key}')`;
    return `(CASE WHEN jsonb_typeof(${json}) = 'string' THEN ${decoded} ELSE ${direct} END)`;
  });
  query = query.replace(/SELECT\s+value\s+FROM\s+json_each\((\?)\)/gi, "SELECT jsonb_array_elements_text($1::jsonb)");
  query = query.replace(/MAX\(0,\s*CAST\(\(julianday\('now'\)\s*-\s*julianday\(([^)]+)\)\)\s*\*\s*86400\s+AS\s+INTEGER\)\)/gi, "GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $1::timestamptz)))::integer)");
  query = query.replace(/\(julianday\('now'\)\s*-\s*julianday\(MAX\(([^)]+)\)\)\)\s*\*\s*86400/gi, "EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX($1)::timestamptz))");
  query = query.replace(/\(julianday\(\?\)\s*-\s*julianday\(MAX\(([^)]+)\)\)\)\s*\*\s*86400/gi, "EXTRACT(EPOCH FROM (?::timestamptz - MAX($1)::timestamptz))");
  query = query.replace(/datetime\('now',\s*'-30 minutes'\)/gi, "(CURRENT_TIMESTAMP - INTERVAL '30 minutes')");
  query = quoteCamelCaseAliases(query);
  query = numberedParameters(query);
  if (ignoreConflict) query += " ON CONFLICT DO NOTHING";
  return query;
}

export function quoteCamelCaseAliases(query: string) {
  return query.replace(/\bAS\s+([a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"');
}

export function numberedParameters(query: string) {
  let index = 0;
  let single = false;
  let double = false;
  let output = "";
  for (let cursor = 0; cursor < query.length; cursor += 1) {
    const character = query[cursor];
    if (character === "'" && !double) {
      if (single && query[cursor + 1] === "'") {
        output += "''";
        cursor += 1;
        continue;
      }
      single = !single;
      output += character;
      continue;
    }
    if (character === '"' && !single) double = !double;
    if (character === "?" && !single && !double) {
      index += 1;
      output += `$${index}`;
    } else output += character;
  }
  return output;
}
