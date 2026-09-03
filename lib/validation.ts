export function isValidEmailAddress(rawValue: string) {
  const value = rawValue.trim();
  if (value.length < 3 || value.length > 254) return false;
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return false;

  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 32 || code === 127) return false;
  }

  const separator = value.indexOf("@");
  if (separator < 1 || separator > 64 || separator !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1).toLowerCase();
  if (!local || local.endsWith(".") || domain.length < 3 || domain.length > 253) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) => {
    if (!label || label.length > 63 || label.startsWith("-") || label.endsWith("-")) return false;
    for (const character of label) {
      const code = character.charCodeAt(0);
      const isDigit = code >= 48 && code <= 57;
      const isLetter = code >= 97 && code <= 122;
      if (!isDigit && !isLetter && character !== "-") return false;
    }
    return true;
  });
}
