import {createHmac,timingSafeEqual} from "node:crypto";
export function isProviderSignatureEnvelopePlausible(timestamp:string|undefined,signature:string|undefined,now=Date.now()){
  if(!timestamp||!signature)return false;const seconds=Number(timestamp),supplied=signature.replace(/^sha256=/,"");
  return Number.isInteger(seconds)&&Math.abs(Math.floor(now/1000)-seconds)<=300&&/^[a-f0-9]{64}$/i.test(supplied);
}
export function verifyProviderSignature(payload:string,timestamp:string|undefined,signature:string|undefined,secret:string,now=Date.now()){
  if(secret.length<16||!isProviderSignatureEnvelopePlausible(timestamp,signature,now))return false;
  const expected=createHmac("sha256",secret).update(`${timestamp}.${payload}`).digest("hex"),supplied=signature!.replace(/^sha256=/,"");
  return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex"));
}
