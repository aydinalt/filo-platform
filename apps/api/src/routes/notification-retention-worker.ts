import type {FastifyInstance} from "fastify";
import {reconcileInterruptedNotificationArchiveReminderRunsSchema,reconcileNotificationArchiveAttemptsSchema,runNotificationArchiveReconciliationReminderSchema,runNotificationArchiveSchema} from "@filo/contracts";
import {executeNotificationArchiveAttempt,reconcileInterruptedArchiveReconciliationReminderRuns,reconcileStaleNotificationArchiveAttempts,runArchiveReconciliationOverdueReminders} from "../lib/notification-retention.js";
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
  app.post("/reconcile-attempts",{preHandler:requireNotificationWorker},async(request,reply)=>{
    const parsed=reconcileNotificationArchiveAttemptsSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTIFICATION_ARCHIVE_RECONCILIATION"});
    const result=await reconcileStaleNotificationArchiveAttempts({...parsed.data,source:"scheduler"});
    if(!result.accepted)return reply.code(result.reason==="invalid_actor"?403:200).send(result);
    return reply.code(result.reconciledCount>0?202:200).send(result);
  });
  app.post("/notify-overdue-reconciliations",{preHandler:requireNotificationWorker},async(request,reply)=>{
    const parsed=runNotificationArchiveReconciliationReminderSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTIFICATION_ARCHIVE_REMINDER_SCAN"});
    const result=await runArchiveReconciliationOverdueReminders({...parsed.data,source:"scheduler"});
    if(!result.accepted)return reply.code(result.reason==="invalid_actor"?403:200).send(result);
    if(result.failed)return reply.code(503).send(result);
    return reply.code(result.summary.notificationsCreated>0?202:200).send(result);
  });
  app.post("/reconcile-interrupted-reminder-runs",{preHandler:requireNotificationWorker},async(request,reply)=>{
    const parsed=reconcileInterruptedNotificationArchiveReminderRunsSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_NOTIFICATION_REMINDER_MAINTENANCE_REQUEST"});
    const result=await reconcileInterruptedArchiveReconciliationReminderRuns({...parsed.data,source:"scheduler"});
    if(!result.accepted)return reply.code(result.reason==="invalid_actor"?403:409).send(result);
    return reply.code(result.reconciledCount>0?202:200).send(result);
  });
}
