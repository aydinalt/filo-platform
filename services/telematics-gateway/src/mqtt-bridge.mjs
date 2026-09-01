import { connectMqtt, postToPlatform } from "./delivery.mjs";
import { deviceByImei, loadRegistry } from "./registry.mjs";

const registry=await loadRegistry(),client=await connectMqtt(),prefix=process.env.MQTT_TOPIC_PREFIX||"filo/v1/ingress";await client.subscribeAsync(`${prefix}/+/+`,{qos:1});console.log(JSON.stringify({timestamp:new Date().toISOString(),level:"info",event:"mqtt_bridge_ready",topic:`${prefix}/+/+`}));
client.on("message",async(topic,raw)=>{try{const parts=topic.split("/"),imei=parts.at(-1),provider=parts.at(-2)?.toUpperCase(),device=deviceByImei(registry,imei),payload=JSON.parse(raw.toString("utf8"));if(device.provider!==provider)throw new Error("MQTT_PROVIDER_MISMATCH");if(payload.platformDeviceId!==device.platformDeviceId||!Array.isArray(payload.records))throw new Error("MQTT_PAYLOAD_INVALID");await postToPlatform(device,payload.records,payload.messageId);console.log(JSON.stringify({timestamp:new Date().toISOString(),level:"info",event:"mqtt_forwarded",messageId:payload.messageId,imeiSuffix:imei.slice(-4)}))}catch(error){console.error(JSON.stringify({timestamp:new Date().toISOString(),level:"error",event:"mqtt_rejected",topic,reason:error.message}))}});

for(const signal of ["SIGTERM","SIGINT"])process.once(signal,async()=>{await client.endAsync();process.exit(0)});
