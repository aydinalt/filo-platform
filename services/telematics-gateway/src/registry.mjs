import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateIccid, validateImei } from "./core.mjs";

export async function loadRegistry(path=process.env.FILO_DEVICE_REGISTRY||resolve(import.meta.dirname,"../gateway.devices.json")){
  const registry=JSON.parse(await readFile(path,"utf8"));return validateRegistry(registry);
}

export function validateRegistry(registry){
  if(registry?.version!==1||!Array.isArray(registry.devices))throw new Error("DEVICE_REGISTRY_FORMAT_INVALID");const imeis=new Set();
  for(const device of registry.devices){if(!validateImei(String(device.imei||"")))throw new Error(`DEVICE_IMEI_INVALID:${device.imei||"missing"}`);if(!validateIccid(String(device.iccid||"")))throw new Error(`DEVICE_ICCID_INVALID:${device.imei}`);if(imeis.has(device.imei))throw new Error(`DEVICE_IMEI_DUPLICATE:${device.imei}`);imeis.add(device.imei);if(!["TELTONIKA","QUECLINK"].includes(device.provider)||!["FMC920","GV57MG_PLUS"].includes(device.modelCode))throw new Error(`DEVICE_PROFILE_UNSUPPORTED:${device.imei}`);if(!device.vehicleId||!device.platformDeviceId||!/^flt_[a-f0-9]{64}$/i.test(device.platformToken||""))throw new Error(`DEVICE_CREDENTIAL_INVALID:${device.imei}`);if(device.provider==="QUECLINK"&&device.vendorProfile?.status!=="APPROVED")device.acceptanceStatus="VENDOR_PROTOCOL_REQUIRED"}
  return registry;
}

export function deviceByImei(registry,imei){const device=registry.devices.find(item=>item.imei===imei&&item.status!=="REVOKED");if(!device)throw new Error(`DEVICE_NOT_PROVISIONED:${imei}`);return device}

if(process.argv.includes("--check")){const registry=await loadRegistry();console.log(JSON.stringify({format:"FILO_GATEWAY_REGISTRY_V1",status:"PASSED",devices:registry.devices.length,blocked:registry.devices.filter(item=>item.acceptanceStatus).length},null,2))}
