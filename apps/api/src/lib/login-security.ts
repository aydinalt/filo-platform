import { verifyPassword } from "./password.js";

// A valid encoded hash ensures unknown accounts pay the same scrypt cost as known accounts.
const INVALID_LOGIN_PASSWORD_HASH =
  "filo-login-equalization-v1:a338ac3e8f100e33f6cc9da79d57db759967d3619666662c924eb1bff7fe971b40d1b6cce5eaaa08e4053de362788fb3b81c2a486389dd57f13f6880ff7b4bd3";

export function verifyLoginPassword(password: string, passwordHash: string | undefined) {
  const matches = verifyPassword(password, passwordHash ?? INVALID_LOGIN_PASSWORD_HASH);
  return passwordHash !== undefined && matches;
}
