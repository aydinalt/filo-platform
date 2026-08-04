import type {FastifyInstance} from "fastify";
import {runNotificationArchiveSchema} from "@filo/contracts";
import {executeNotificationArchiveAttempt} from "../lib/notification-retention.js";
import {requireNotificationWorker} from "../lib/worker-auth.js";

export async function notificationRetentionWorkerRoutes(app:FastifyInstance){
  app.post("/run",{preHandler:requireNotificationWorker},async(request,reply)=>{
    const parsed=runNotificationArchiveSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTIFICATION_ARCHIVE_REQUEST"});
    const input=parsed.data;
    const result=await executeNotificationArchiveAttempt({...input,source:"scheduler"});
    if(!result.accepted)return reply.code(result.reason==="invalid_actor"?403:200).send(result);
    if(result.failed)return reply.code(503).send(result);
    return reply.code(result.result.skipped?200:202).send(result);
  });
}
