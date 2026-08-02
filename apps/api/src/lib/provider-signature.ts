import {createHmac,timingSafeEqual} from "node:crypto";
export function verifyProviderSignature(payload:string,timestamp:string|undefined,signature:string|undefined,secret:string,now=Date.now()){
  if(!timestamp||!signature||secret.length<16)return false;const seconds=Number(timestamp);
  if(!Number.isInteger(seconds)||Math.abs(Math.floor(now/1000)-seconds)>300)return false;
  const expected=createHmac("sha256",secret).update(`${timestamp}.${payload}`).digest("hex"),supplied=signature.replace(/^sha256=/,"");
  if(!/^[a-f0-9]{64}$/i.test(supplied))return false;return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex"));
}
