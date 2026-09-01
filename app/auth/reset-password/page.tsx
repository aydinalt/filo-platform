"use client";

import { useState } from "react";
import Link from "next/link";
import { updatePassword } from "../../supabase-browser";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (password.length < 10) return setMessage("Şifre en az 10 karakter olmalıdır.");
    setBusy(true);
    try { await updatePassword(password); setMessage("Şifreniz güncellendi. Ana sayfadan giriş yapabilirsiniz."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Şifre güncellenemedi."); }
    finally { setBusy(false); }
  };
  return <main className="login-shell"><section className="login-panel"><div className="login-box auth-forgot"><span className="step-label">HESAP KURTARMA</span><h1>Yeni şifrenizi belirleyin</h1><p>Güvenliğiniz için en az 10 karakter kullanın.</p><label>E-posta hesabınız için yeni şifre<input type="password" minLength={10} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}/></label>{message && <div className="auth-message" role="status">{message}</div>}<button className="primary full" disabled={busy} onClick={() => void submit()}>{busy ? "Güncelleniyor…" : "Şifreyi güncelle"}</button><Link className="auth-back" href="/">← Giriş ekranına dön</Link></div></section></main>;
}
