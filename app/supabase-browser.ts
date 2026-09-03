"use client";

import { createBrowserClient } from "@supabase/ssr";

export const supabaseAuthEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const deploymentTier = String(process.env.NEXT_PUBLIC_FILO_DEPLOYMENT_TIER || (supabaseAuthEnabled ? "production" : "prototype")).trim().toLowerCase();
export const demoAuthAvailable = deploymentTier === "prototype";

function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase authentication is not configured.");
  return createBrowserClient(url, key);
}

export async function signInWithPassword(email: string, password: string, captchaToken?: string) {
  const { error } = await browserClient().auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) throw error;
}

export async function signInWithDemo(username: string, password: string) {
  const response = await fetch("/api/demo-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", username, password }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; account?: { username: "admin" | "demo1" | "demo2"; name: string } };
  if (!response.ok) throw new Error(result.error || "Demo girişi tamamlanamadı.");
  if (!result.account) throw new Error("Demo oturum bilgisi alınamadı.");
  return result.account;
}

export async function signOutDemo() {
  const response = await fetch("/api/demo-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  if (!response.ok) throw new Error("Demo oturumu kapatılamadı.");
}

export async function signUpWithPassword(email: string, password: string, legalVersion:string, captchaToken?: string) {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/?signup=1")}`;
  const acceptedAt=new Date().toISOString();
  const { data, error } = await browserClient().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, captchaToken, data:{filo_signup_contract:"FILO_PUBLIC_SIGNUP_V1",filo_terms_version:legalVersion,filo_privacy_version:legalVersion,filo_accepted_at:acceptedAt} } });
  if (error) throw error;
  return { confirmationRequired: !data.session };
}

export async function sendPasswordReset(email: string, captchaToken?: string) {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`;
  const { error } = await browserClient().auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await browserClient().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOutSupabase() {
  const { error } = await browserClient().auth.signOut();
  if (error) throw error;
}

export async function getMfaStatus(){
  const client=browserClient();
  const [assurance,factors]=await Promise.all([client.auth.mfa.getAuthenticatorAssuranceLevel(),client.auth.mfa.listFactors()]);
  if(assurance.error)throw assurance.error;if(factors.error)throw factors.error;
  return {currentLevel:assurance.data.currentLevel,nextLevel:assurance.data.nextLevel,totp:factors.data.totp};
}

export async function enrollTotp(friendlyName="Filo Platform"){
  const {data,error}=await browserClient().auth.mfa.enroll({factorType:"totp",friendlyName});
  if(error)throw error;return data;
}

export async function verifyTotp(factorId:string,code:string){
  const client=browserClient();
  const challenge=await client.auth.mfa.challenge({factorId});
  if(challenge.error)throw challenge.error;
  const verification=await client.auth.mfa.verify({factorId,challengeId:challenge.data.id,code});
  if(verification.error)throw verification.error;return verification.data;
}

export async function removeMfaFactor(factorId:string){
  const client=browserClient();
  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error)throw assurance.error;
  if(assurance.data.currentLevel!=="aal2")throw new Error("MFA faktörünü kaldırmak için önce AAL2 doğrulaması gereklidir.");
  const {data,error}=await client.auth.mfa.unenroll({factorId});
  if(error)throw error;return data;
}
