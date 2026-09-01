import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function luhnValid(value){
  if(!/^\d+$/.test(value))return false;let total=0,doubleDigit=false;
  for(let index=value.length-1;index>=0;index--){let digit=Number(value[index]);if(doubleDigit){digit*=2;if(digit>9)digit-=9}total+=digit;doubleDigit=!doubleDigit}
  return total%10===0;
}

export function validateImei(value){return /^\d{15}$/.test(value)&&luhnValid(value)}
export function validateIccid(value){return /^\d{18,22}$/.test(value)&&luhnValid(value)}
export function sha256(value){return createHash("sha256").update(value).digest("hex")}
export function signGatewayBody(token,sentAt,messageId,body){return createHmac("sha256",token).update(`${sentAt}.${messageId}.${body}`).digest("hex")}
export function secureHexEqual(left,right){if(!/^[a-f0-9]+$/i.test(left)||left.length!==right.length)return false;return timingSafeEqual(Buffer.from(left,"hex"),Buffer.from(right,"hex"))}

export function crc16Ibm(buffer){let crc=0;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc&1)?(crc>>>1)^0xa001:crc>>>1}return crc&0xffff}

export function parseTeltonikaImeiHandshake(buffer){
  if(buffer.length<2)return null;const length=buffer.readUInt16BE(0);if(length!==15)throw new Error("TELTONIKA_IMEI_LENGTH_INVALID");if(buffer.length<2+length)return null;
  const imei=buffer.subarray(2,2+length).toString("ascii");if(!validateImei(imei))throw new Error("TELTONIKA_IMEI_INVALID");return {imei,bytesConsumed:2+length,response:Buffer.from([1])};
}

const readUnsigned=(buffer,offset,size)=>{if(offset+size>buffer.length)throw new Error("TELTONIKA_FRAME_TRUNCATED");if(size===8){const value=buffer.readBigUInt64BE(offset);return value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):value.toString()}return buffer.readUIntBE(offset,size)};
const readSigned=(buffer,offset,size)=>{if(offset+size>buffer.length)throw new Error("TELTONIKA_FRAME_TRUNCATED");return buffer.readIntBE(offset,size)};

function parseIo(buffer,state,codec){
  const idSize=codec===0x8e?2:1,countSize=idSize,io={};state.offset+=idSize;state.offset+=countSize;
  for(const valueSize of [1,2,4,8]){const count=readUnsigned(buffer,state.offset,countSize);state.offset+=countSize;for(let index=0;index<count;index++){const id=readUnsigned(buffer,state.offset,idSize);state.offset+=idSize;io[id]=readUnsigned(buffer,state.offset,valueSize);state.offset+=valueSize}}
  if(codec===0x8e){const variableCount=readUnsigned(buffer,state.offset,2);state.offset+=2;for(let index=0;index<variableCount;index++){const id=readUnsigned(buffer,state.offset,2),size=readUnsigned(buffer,state.offset+2,2);state.offset+=4;if(state.offset+size>buffer.length)throw new Error("TELTONIKA_IO_TRUNCATED");io[id]=buffer.subarray(state.offset,state.offset+size).toString("hex");state.offset+=size}}
  return io;
}

export function parseTeltonikaAvlFrame(frame){
  if(frame.length<8||frame.readUInt32BE(0)!==0)throw new Error("TELTONIKA_PREAMBLE_INVALID");const dataLength=frame.readUInt32BE(4),end=8+dataLength;if(dataLength<3)throw new Error("TELTONIKA_FRAME_LENGTH_INVALID");if(frame.length<end+4)return null;
  const data=frame.subarray(8,end),expectedCrc=frame.readUInt32BE(end)&0xffff,actualCrc=crc16Ibm(data);if(expectedCrc!==actualCrc)throw new Error("TELTONIKA_CRC_INVALID");const codec=data[0];if(codec!==0x08&&codec!==0x8e)throw new Error("TELTONIKA_CODEC_UNSUPPORTED");
  const count=data[1],state={offset:2},records=[];for(let index=0;index<count;index++){const timestamp=readUnsigned(data,state.offset,8);state.offset+=8;const priority=readUnsigned(data,state.offset,1);state.offset+=1;const longitude=readSigned(data,state.offset,4)/1e7;state.offset+=4;const latitude=readSigned(data,state.offset,4)/1e7;state.offset+=4;const altitude=readUnsigned(data,state.offset,2);state.offset+=2;const heading=readUnsigned(data,state.offset,2);state.offset+=2;const satellites=readUnsigned(data,state.offset,1);state.offset+=1;const speed=readUnsigned(data,state.offset,2);state.offset+=2;const io=parseIo(data,state,codec);records.push({capturedAt:new Date(Number(timestamp)).toISOString(),latitude,longitude,altitude,heading,speed,battery:0,accuracy:0,sequence:Number(timestamp),eventType:Number(io[239])===1?"IGNITION_ON":"LOCATION",meta:{priority,satellites,io}})}
  const repeated=data[state.offset];if(repeated!==count||state.offset+1!==data.length)throw new Error("TELTONIKA_RECORD_COUNT_INVALID");const acknowledgement=Buffer.alloc(4);acknowledgement.writeUInt32BE(count);return {codec:codec===0x08?"CODEC8":"CODEC8E",recordCount:count,records,crc:actualCrc,acknowledgement,bytesConsumed:end+4};
}

function parseUtc14(value){if(!/^\d{14}$/.test(value))throw new Error("QUECLINK_TIMESTAMP_INVALID");const year=value.slice(0,4),month=value.slice(4,6),day=value.slice(6,8),hour=value.slice(8,10),minute=value.slice(10,12),second=value.slice(12,14),date=new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);if(Number.isNaN(date.getTime()))throw new Error("QUECLINK_TIMESTAMP_INVALID");return date.toISOString()}

export function parseQueclinkLine(line,profile){
  const value=String(line).trim();if(!/^\+(RESP|BUFF):[^$]+\$$/.test(value))throw new Error("QUECLINK_FRAME_INVALID");if(!profile||profile.status!=="APPROVED"||!profile.fields)throw new Error("QUECLINK_VENDOR_PROFILE_REQUIRED");const fields=value.slice(0,-1).split(","),at=index=>fields[Number(index)]??"",imei=at(profile.fields.imei);if(!validateImei(imei))throw new Error("QUECLINK_IMEI_INVALID");const latitude=Number(at(profile.fields.latitude)),longitude=Number(at(profile.fields.longitude));if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new Error("QUECLINK_COORDINATE_INVALID");return {imei,protocol:"ATRACK_PROFILE_V1",records:[{capturedAt:parseUtc14(at(profile.fields.timestamp)),latitude,longitude,speed:Math.max(0,Number(at(profile.fields.speed))||0),heading:Math.max(0,Number(at(profile.fields.heading))||0),altitude:Number(at(profile.fields.altitude))||0,battery:0,accuracy:0,sequence:Date.now(),eventType:"LOCATION",meta:{messageType:fields[0]}}]};
}

export function normalizeGatewayBatch(device,records,messageId){if(!device||!validateImei(device.imei)||!Array.isArray(records)||records.length<1||records.length>100)throw new Error("GATEWAY_BATCH_INVALID");return {provider:device.provider,protocol:device.protocol,imei:device.imei,vehicleId:device.vehicleId,messageId,records:records.map(point=>({...point,vehicleId:device.vehicleId}))}}
