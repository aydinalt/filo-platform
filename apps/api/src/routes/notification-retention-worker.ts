import type {FastifyInstance} from "fastify";
import {runNotificationArchiveSchema} from "@filo/contracts";
import {withTenantTransaction} from "@filo/database";
import {runNotificationArchive} from "../lib/notification-retention.js";
import {requireNotificationWorker} from "../lib/worker-auth.js";

export async function notificationRetentionWorkerRoutes(app:FastifyInstance){
  app.post("/run",{preHandler:requireNotificationWorker},async(request,reply)=>{
    const parsed=runNotificationArchiveSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTIFICATION_ARCHIVE_REQUEST"});
    const input=parsed.data;
    const result=await withTenantTransaction(input.tenantId,input.actorUserId,client=>runNotificationArchive(client,input.tenantId,input.actorUserId,input.runKey,"scheduler"));
    return reply.code(result.skipped?200:202).send(result);
  });
}
