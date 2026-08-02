import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export function requireNotificationWorker(request:FastifyRequest,reply:FastifyReply,done:()=>void){
  const supplied=request.headers["x-worker-key"];
  const expected=Buffer.from(config.notificationWorkerKey);
  const actual=Buffer.from(typeof supplied==="string"?supplied:"");
  if(expected.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected)){
    reply.code(401).send({error:"INVALID_WORKER_CREDENTIAL"});return;
  }
  done();
}

export function retryDelayMinutes(attemptCount:number){return Math.min(60,Math.max(1,2**Math.max(0,attemptCount-1)));}
