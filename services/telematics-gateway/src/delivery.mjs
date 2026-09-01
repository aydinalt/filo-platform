import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeGatewayBatch, signGatewayBody } from "./core.mjs";

export async function postToPlatform(device,records,messageId=`GTW-${randomUUID()}`){
  const body=JSON.stringify(normalizeGatewayBatch(device,records,messageId)),sentAt=new Date().toISOString(),signature=signGatewayBody(device.platformToken,sentAt,messageId,body),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(`${String(device.apiBaseUrl).replace(/\/$/,"")}/api/tracker-gateway`,{method:"POST",headers:{authorization:`Bearer ${device.platformToken}`,"content-type":"application/json","x-filo-message-id":messageId,"x-filo-sent-at":sentAt,"x-filo-signature":signature},body,signal:controller.signal});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`PLATFORM_INGEST_${response.status}:${result.error||"unknown"}`);return result}finally{clearTimeout(timeout)}
}

export async function connectMqtt(){
  const mqtt=await import("mqtt"),url=process.env.MQTT_URL,clientId=process.env.MQTT_CLIENT_ID,hasPassword=Boolean(process.env.MQTT_USERNAME&&process.env.MQTT_PASSWORD),hasCertificate=Boolean(process.env.MQTT_CERT_FILE&&process.env.MQTT_KEY_FILE);if(!url?.startsWith("mqtts://"))throw new Error("MQTT_TLS_URL_REQUIRED");if(!/^[A-Za-z0-9._-]{8,80}$/.test(clientId||""))throw new Error("MQTT_STABLE_CLIENT_ID_REQUIRED");if(!hasPassword&&!hasCertificate)throw new Error("MQTT_CLIENT_AUTH_REQUIRED");const options={clientId,username:process.env.MQTT_USERNAME,password:process.env.MQTT_PASSWORD,rejectUnauthorized:true,reconnectPeriod:5000,clean:false};
  if(process.env.MQTT_CA_FILE)options.ca=await readFile(process.env.MQTT_CA_FILE);if(process.env.MQTT_CERT_FILE&&process.env.MQTT_KEY_FILE){options.cert=await readFile(process.env.MQTT_CERT_FILE);options.key=await readFile(process.env.MQTT_KEY_FILE)}return mqtt.connectAsync(url,options);
}

export async function publishMqtt(client,device,records,messageId=`GTW-${randomUUID()}`){const topic=`${process.env.MQTT_TOPIC_PREFIX||"filo/v1/ingress"}/${device.provider.toLowerCase()}/${device.imei}`,payload=JSON.stringify({version:1,messageId,receivedAt:new Date().toISOString(),platformDeviceId:device.platformDeviceId,records});await client.publishAsync(topic,payload,{qos:1,retain:false});return {topic,messageId}}
