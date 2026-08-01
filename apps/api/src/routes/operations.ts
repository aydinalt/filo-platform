import type { FastifyInstance } from "fastify";
import { createAlertRuleSchema, createAssignmentSchema, createGeofenceSchema, createLocationEventSchema, startShiftSchema, updateTrackingSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const assignmentSelect = `SELECT a.id,a.tenant_id AS "tenantId",a.vehicle_id AS "vehicleId",
 v.plate AS "vehiclePlate",a.driver_id AS "driverId",r.full_name AS "driverName",
 a.device_id AS "deviceId",d.model AS "deviceModel",a.starts_at AS "startsAt",
 a.ended_at AS "endedAt",a.created_at AS "createdAt"
 FROM vehicle_driver_assignments a JOIN vehicles v ON v.id=a.vehicle_id
 JOIN drivers r ON r.id=a.driver_id LEFT JOIN devices d ON d.id=a.device_id`;

function distanceMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
  const radians=(value:number)=>value*Math.PI/180;
  const dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude);
  const value=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
}

export async function operationRoutes(app: FastifyInstance) {
  app.get("/alert-rules",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`SELECT id,name,type,geofence_id AS "geofenceId",threshold_kph AS "thresholdKph",status,created_at AS "createdAt" FROM alert_rules ORDER BY status,name`)).rows;
    return {rules:rows.map(row=>({...row,createdAt:row.createdAt.toISOString()}))};
  }));
  app.post("/alert-rules",{preHandler:[requireSession,allow("owner","admin")]},async(request,reply)=>{
    const parsed=createAlertRuleSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:"INVALID_ALERT_RULE"});
    const user=request.sessionUser;
    const rule=await withTenantTransaction(user.tenantId,user.id,async client=>{
      if(parsed.data.geofenceId){const found=await client.query("SELECT 1 FROM geofences WHERE id=$1 AND status='active'",[parsed.data.geofenceId]);if(!found.rowCount)return null;}
      const row=(await client.query(`INSERT INTO alert_rules(tenant_id,name,type,geofence_id,threshold_kph,created_by) VALUES($1,$2,$3,$4,$5,$6)
        RETURNING id,name,type,geofence_id AS "geofenceId",threshold_kph AS "thresholdKph",status,created_at AS "createdAt"`,[user.tenantId,parsed.data.name,parsed.data.type,parsed.data.geofenceId,parsed.data.thresholdKph,user.id])).rows[0];
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'alert_rule.created','alert_rule',$3)`,[user.tenantId,user.id,row.id]);return row;
    });
    return rule?reply.code(201).send({rule:{...rule,createdAt:rule.createdAt.toISOString()}}):reply.code(404).send({error:"ACTIVE_GEOFENCE_NOT_FOUND"});
  });
  app.get("/alerts",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`SELECT a.id::text,a.rule_id AS "ruleId",r.name AS "ruleName",a.type,a.assignment_id AS "assignmentId",v.plate AS "vehiclePlate",d.full_name AS "driverName",a.occurred_at AS "occurredAt",a.status,a.metadata,a.acknowledged_at AS "acknowledgedAt",a.resolved_at AS "resolvedAt"
      FROM operational_alerts a JOIN alert_rules r ON r.id=a.rule_id JOIN vehicle_driver_assignments x ON x.id=a.assignment_id JOIN vehicles v ON v.id=x.vehicle_id JOIN drivers d ON d.id=x.driver_id ORDER BY a.occurred_at DESC LIMIT 250`)).rows;
    return {alerts:rows.map(row=>({...row,occurredAt:row.occurredAt.toISOString(),acknowledgedAt:row.acknowledgedAt?.toISOString()??null,resolvedAt:row.resolvedAt?.toISOString()??null}))};
  }));
  app.patch("/alerts/:id/status",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const id=(request.params as {id?:string}).id,status=(request.body as {status?:string})?.status;
    if(!id||!status||!["acknowledged","resolved"].includes(status))return reply.code(400).send({error:"INVALID_ALERT_STATUS"});
    const user=request.sessionUser;
    const changed=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const result=await client.query(`UPDATE operational_alerts SET status=$2,acknowledged_at=COALESCE(acknowledged_at,now()),acknowledged_by=COALESCE(acknowledged_by,$3),resolved_at=CASE WHEN $2='resolved' THEN now() ELSE resolved_at END,resolved_by=CASE WHEN $2='resolved' THEN $3 ELSE resolved_by END WHERE id=$1 AND status<>$2 RETURNING id`,[id,status,user.id]);
      if(!result.rowCount)return false;await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'alert.status_changed','operational_alert',$3,jsonb_build_object('status',$4))`,[user.tenantId,user.id,id,status]);return true;
    });return changed?reply.code(204).send():reply.code(404).send({error:"ALERT_NOT_FOUND_OR_UNCHANGED"});
  });
  app.get("/geofences", {preHandler:requireSession}, async request =>
    withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
      const geofences=(await client.query(`SELECT id,name,latitude,longitude,radius_meters AS "radiusMeters",status,created_at AS "createdAt"
        FROM geofences ORDER BY status ASC,name ASC`)).rows;
      return {geofences:geofences.map(item=>({...item,createdAt:item.createdAt.toISOString()}))};
    }));

  app.post("/geofences",{preHandler:[requireSession,allow("owner","admin")]},async(request,reply)=>{
    const parsed=createGeofenceSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_GEOFENCE"});
    const user=request.sessionUser;
    try{
      const row=await withTenantTransaction(user.tenantId,user.id,async client=>{
        const result=(await client.query(`INSERT INTO geofences(tenant_id,name,latitude,longitude,radius_meters,created_by)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,latitude,longitude,radius_meters AS "radiusMeters",status,created_at AS "createdAt"`,
          [user.tenantId,parsed.data.name,parsed.data.latitude,parsed.data.longitude,parsed.data.radiusMeters,user.id])).rows[0];
        await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
          VALUES($1,$2,'geofence.created','geofence',$3,jsonb_build_object('name',$4,'radiusMeters',$5))`,
          [user.tenantId,user.id,result.id,result.name,result.radiusMeters]);
        return result;
      });
      return reply.code(201).send({geofence:{...row,createdAt:row.createdAt.toISOString()}});
    }catch(error){if((error as {code?:string}).code==="23505")return reply.code(409).send({error:"GEOFENCE_NAME_EXISTS"});throw error;}
  });

  app.patch("/geofences/:id/deactivate",{preHandler:[requireSession,allow("owner","admin")]},async(request,reply)=>{
    const id=(request.params as {id?:string}).id;if(!id)return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    const changed=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const result=await client.query("UPDATE geofences SET status='inactive' WHERE id=$1 AND status='active' RETURNING id",[id]);
      if(!result.rowCount)return false;
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'geofence.deactivated','geofence',$3)`,[user.tenantId,user.id,id]);
      return true;
    });
    return changed?reply.code(204).send():reply.code(404).send({error:"ACTIVE_GEOFENCE_NOT_FOUND"});
  });

  app.get("/geofence-events",{preHandler:requireSession},async request=>
    withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
      const events=(await client.query(`SELECT e.id::text,e.geofence_id AS "geofenceId",g.name AS "geofenceName",
        e.assignment_id AS "assignmentId",v.plate AS "vehiclePlate",d.full_name AS "driverName",
        e.event_type AS "eventType",e.occurred_at AS "occurredAt"
        FROM geofence_events e JOIN geofences g ON g.id=e.geofence_id
        JOIN vehicle_driver_assignments a ON a.id=e.assignment_id JOIN vehicles v ON v.id=a.vehicle_id
        JOIN drivers d ON d.id=a.driver_id ORDER BY e.occurred_at DESC LIMIT 200`)).rows;
      return {events:events.map(item=>({...item,occurredAt:item.occurredAt.toISOString()}))};
    }));
  app.get("/assignments", { preHandler: requireSession }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const rows = (await client.query(`${assignmentSelect} ORDER BY a.created_at DESC`)).rows;
      return { assignments: rows.map(r => ({...r, startsAt:r.startsAt.toISOString(), endedAt:r.endedAt?.toISOString()??null, createdAt:r.createdAt.toISOString()})) };
    }));

  app.post("/assignments", { preHandler: [requireSession, allow("owner","admin","operator")] }, async (request, reply) => {
    const parsed=createAssignmentSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    try {
      const assignment=await withTenantTransaction(user.tenantId,user.id,async(client)=>{
        const valid=await client.query(`SELECT
          EXISTS(SELECT 1 FROM vehicles WHERE id=$1 AND status='active') AS vehicle,
          EXISTS(SELECT 1 FROM drivers WHERE id=$2 AND status='active') AS driver,
          ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM devices WHERE id=$3 AND status='active' AND (driver_id IS NULL OR driver_id=$2))) AS device`,
          [parsed.data.vehicleId,parsed.data.driverId,parsed.data.deviceId]);
        if(!valid.rows[0]?.vehicle||!valid.rows[0]?.driver||!valid.rows[0]?.device) return null;
        const inserted=await client.query<{id:string}>(`INSERT INTO vehicle_driver_assignments
          (tenant_id,vehicle_id,driver_id,device_id,starts_at,created_by)
          VALUES($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6) RETURNING id`,
          [user.tenantId,parsed.data.vehicleId,parsed.data.driverId,parsed.data.deviceId,parsed.data.startsAt??null,user.id]);
        const id=inserted.rows[0]!.id;
        await client.query(`INSERT INTO tracking_statuses(assignment_id,tenant_id,updated_by) VALUES($1,$2,$3)`,[id,user.tenantId,user.id]);
        await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
          VALUES($1,$2,'assignment.created','assignment',$3,jsonb_build_object('vehicleId',$4,'driverId',$5))`,
          [user.tenantId,user.id,id,parsed.data.vehicleId,parsed.data.driverId]);
        return (await client.query(`${assignmentSelect} WHERE a.id=$1`,[id])).rows[0];
      });
      if(!assignment) return reply.code(400).send({error:"ASSIGNMENT_REFERENCE_INVALID"});
      return reply.code(201).send({assignment:{...assignment,startsAt:assignment.startsAt.toISOString(),endedAt:null,createdAt:assignment.createdAt.toISOString()}});
    } catch(error) {
      if((error as {code?:string}).code==="23505") return reply.code(409).send({error:"ACTIVE_ASSIGNMENT_CONFLICT"});
      throw error;
    }
  });

  app.patch("/assignments/:id/end", { preHandler:[requireSession,allow("owner","admin","operator")] }, async(request,reply)=>{
    const id=(request.params as {id?:string}).id; if(!id) return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    const ended=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const activeShift=await client.query("SELECT 1 FROM work_shifts WHERE assignment_id=$1 AND status='active'",[id]);
      if(activeShift.rowCount) return "shift";
      const result=await client.query("UPDATE vehicle_driver_assignments SET ended_at=now() WHERE id=$1 AND ended_at IS NULL RETURNING id",[id]);
      if(!result.rowCount) return null;
      await client.query("UPDATE tracking_statuses SET state='off',updated_at=now(),updated_by=$2 WHERE assignment_id=$1",[id,user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'assignment.ended','assignment',$3)`,[user.tenantId,user.id,id]);
      return "ok";
    });
    if(ended==="shift") return reply.code(409).send({error:"ACTIVE_SHIFT_EXISTS"});
    if(!ended) return reply.code(404).send({error:"ASSIGNMENT_NOT_FOUND"});
    return reply.code(204).send();
  });

  app.get("/shifts", {preHandler:requireSession}, async request =>
    withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
      const rows=(await client.query(`SELECT s.id,s.assignment_id AS "assignmentId",v.plate AS "vehiclePlate",
        d.full_name AS "driverName",s.started_at AS "startedAt",s.ended_at AS "endedAt",s.status
        FROM work_shifts s JOIN vehicle_driver_assignments a ON a.id=s.assignment_id
        JOIN vehicles v ON v.id=a.vehicle_id JOIN drivers d ON d.id=a.driver_id ORDER BY s.started_at DESC`)).rows;
      return {shifts:rows.map(r=>({...r,startedAt:r.startedAt.toISOString(),endedAt:r.endedAt?.toISOString()??null}))};
    }));

  app.post("/shifts", {preHandler:[requireSession,allow("owner","admin","operator")]}, async(request,reply)=>{
    const parsed=startShiftSchema.safeParse(request.body); if(!parsed.success)return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    try {
      const shift=await withTenantTransaction(user.tenantId,user.id,async client=>{
        const assignment=await client.query("SELECT 1 FROM vehicle_driver_assignments WHERE id=$1 AND ended_at IS NULL",[parsed.data.assignmentId]);
        if(!assignment.rowCount)return null;
        const row=(await client.query(`INSERT INTO work_shifts(tenant_id,assignment_id,started_by) VALUES($1,$2,$3) RETURNING id`,[user.tenantId,parsed.data.assignmentId,user.id])).rows[0];
        await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'shift.started','shift',$3)`,[user.tenantId,user.id,row.id]);
        return row;
      });
      if(!shift)return reply.code(404).send({error:"ACTIVE_ASSIGNMENT_NOT_FOUND"});
      return reply.code(201).send({shift});
    } catch(error){if((error as {code?:string}).code==="23505")return reply.code(409).send({error:"ACTIVE_SHIFT_CONFLICT"});throw error;}
  });

  app.patch("/shifts/:id/end",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const id=(request.params as {id?:string}).id;if(!id)return reply.code(400).send({error:"INVALID_INPUT"});const user=request.sessionUser;
    const found=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const row=await client.query(`UPDATE work_shifts SET status='completed',ended_at=now(),ended_by=$2 WHERE id=$1 AND status='active' RETURNING assignment_id`,[id,user.id]);
      if(!row.rowCount)return false;
      await client.query("UPDATE tracking_statuses SET state='off',updated_at=now(),updated_by=$2 WHERE assignment_id=$1",[row.rows[0].assignment_id,user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'shift.ended','shift',$3)`,[user.tenantId,user.id,id]);return true;
    });return found?reply.code(204).send():reply.code(404).send({error:"ACTIVE_SHIFT_NOT_FOUND"});
  });

  app.get("/tracking",{preHandler:requireSession},async request=>withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
    const rows=(await client.query(`SELECT assignment_id AS "assignmentId",permission,state,error_code AS "errorCode",updated_at AS "updatedAt" FROM tracking_statuses ORDER BY updated_at DESC`)).rows;
    return {tracking:rows.map(r=>({...r,updatedAt:r.updatedAt.toISOString()}))};
  }));
  app.patch("/tracking/:assignmentId",{preHandler:[requireSession,allow("owner","admin","operator")]},async(request,reply)=>{
    const parsed=updateTrackingSchema.safeParse(request.body), assignmentId=(request.params as {assignmentId?:string}).assignmentId;
    if(!parsed.success||!assignmentId)return reply.code(400).send({error:"INVALID_INPUT"});const user=request.sessionUser;
    let state=parsed.data.state;
    if(["denied","restricted"].includes(parsed.data.permission)) state="permission_revoked";
    const result=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const row=await client.query(`UPDATE tracking_statuses SET permission=$1,state=$2,error_code=$3,updated_at=now(),updated_by=$4
        WHERE assignment_id=$5 RETURNING assignment_id`,[parsed.data.permission,state,parsed.data.errorCode??null,user.id,assignmentId]);
      if(!row.rowCount)return false;
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES($1,$2,'tracking.status_changed','assignment',$3,jsonb_build_object('permission',$4,'state',$5))`,[user.tenantId,user.id,assignmentId,parsed.data.permission,state]);return true;
    });return result?{tracking:{assignmentId,permission:parsed.data.permission,state,errorCode:parsed.data.errorCode??null}}:reply.code(404).send({error:"ASSIGNMENT_NOT_FOUND"});
  });

  app.post("/locations", {preHandler:[requireSession,allow("owner","admin","operator")]}, async(request,reply)=>{
    const parsed=createLocationEventSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"INVALID_LOCATION"});
    const recordedAt=new Date(parsed.data.recordedAt);
    if(Math.abs(Date.now()-recordedAt.getTime())>5*60*1000)return reply.code(400).send({error:"LOCATION_TIME_OUT_OF_RANGE"});
    const user=request.sessionUser;
    const result=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const eligible=await client.query(`SELECT 1 FROM vehicle_driver_assignments a
        JOIN work_shifts s ON s.assignment_id=a.id AND s.status='active'
        JOIN tracking_statuses t ON t.assignment_id=a.id AND t.state='tracking'
        WHERE a.id=$1 AND a.ended_at IS NULL`,[parsed.data.assignmentId]);
      if(!eligible.rowCount)return "inactive" as const;
      const inserted=await client.query<{id:string}>(`INSERT INTO location_events
        (tenant_id,assignment_id,event_id,recorded_at,latitude,longitude,accuracy_meters,speed_mps,heading_degrees)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (tenant_id,event_id) DO NOTHING RETURNING id::text`,[
        user.tenantId,parsed.data.assignmentId,parsed.data.eventId,recordedAt,
        parsed.data.latitude,parsed.data.longitude,parsed.data.accuracyMeters,
        parsed.data.speedMps??null,parsed.data.headingDegrees??null]);
      if(!inserted.rowCount)return "duplicate" as const;
      const locationEventId=inserted.rows[0]!.id;
      const fences=(await client.query(`SELECT id,latitude,longitude,radius_meters AS "radiusMeters" FROM geofences WHERE status='active'`)).rows;
      for(const fence of fences){
        const inside=distanceMeters(parsed.data,{latitude:fence.latitude,longitude:fence.longitude})<=fence.radiusMeters;
        const previous=await client.query<{isInside:boolean}>(`SELECT is_inside AS "isInside" FROM geofence_assignment_states
          WHERE geofence_id=$1 AND assignment_id=$2 FOR UPDATE`,[fence.id,parsed.data.assignmentId]);
        if(!previous.rowCount){
          await client.query(`INSERT INTO geofence_assignment_states(tenant_id,geofence_id,assignment_id,is_inside,last_location_event_id,observed_at)
            VALUES($1,$2,$3,$4,$5,$6)`,[user.tenantId,fence.id,parsed.data.assignmentId,inside,locationEventId,recordedAt]);
          if(!inside)continue;
        }else{
          if(previous.rows[0]!.isInside===inside){
            await client.query(`UPDATE geofence_assignment_states SET last_location_event_id=$3,observed_at=$4
              WHERE geofence_id=$1 AND assignment_id=$2`,[fence.id,parsed.data.assignmentId,locationEventId,recordedAt]);
            continue;
          }
          await client.query(`UPDATE geofence_assignment_states SET is_inside=$3,last_location_event_id=$4,observed_at=$5
            WHERE geofence_id=$1 AND assignment_id=$2`,[fence.id,parsed.data.assignmentId,inside,locationEventId,recordedAt]);
        }
        const transition=inside?"entered":"exited";
        const event=(await client.query<{id:string}>(`INSERT INTO geofence_events(tenant_id,geofence_id,assignment_id,location_event_id,event_type,occurred_at)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`,[user.tenantId,fence.id,parsed.data.assignmentId,locationEventId,transition,recordedAt])).rows[0]!;
        await client.query(`INSERT INTO operational_alerts(tenant_id,rule_id,assignment_id,location_event_id,geofence_event_id,type,occurred_at,metadata)
          SELECT $1,r.id,$2,$3,$4,r.type,$5,jsonb_build_object('geofenceId',$6) FROM alert_rules r
          WHERE r.status='active' AND r.type=$7 AND r.geofence_id=$6 ON CONFLICT DO NOTHING`,[user.tenantId,parsed.data.assignmentId,locationEventId,event.id,recordedAt,fence.id,`geofence_${transition}`]);
      }
      if(parsed.data.speedMps!==null&&parsed.data.speedMps!==undefined){
        await client.query(`INSERT INTO operational_alerts(tenant_id,rule_id,assignment_id,location_event_id,type,occurred_at,metadata)
          SELECT $1,r.id,$2,$3,'speeding',$4,jsonb_build_object('speedKph',round(($5::numeric*3.6),1),'thresholdKph',r.threshold_kph)
          FROM alert_rules r WHERE r.status='active' AND r.type='speeding' AND ($5*3.6)>=r.threshold_kph ON CONFLICT DO NOTHING`,[user.tenantId,parsed.data.assignmentId,locationEventId,recordedAt,parsed.data.speedMps]);
      }
      return "created" as const;
    });
    if(result==="inactive")return reply.code(409).send({error:"TRACKING_NOT_ACTIVE"});
    return reply.code(result==="created"?201:200).send({accepted:true,duplicate:result==="duplicate"});
  });

  app.get("/locations/latest",{preHandler:requireSession},async request=>
    withTenantTransaction(request.sessionUser.tenantId,request.sessionUser.id,async client=>{
      const rows=(await client.query(`SELECT DISTINCT ON (e.assignment_id)
        e.assignment_id AS "assignmentId",v.plate AS "vehiclePlate",d.full_name AS "driverName",
        e.latitude,e.longitude,e.accuracy_meters AS "accuracyMeters",
        e.recorded_at AS "recordedAt",e.received_at AS "receivedAt"
        FROM location_events e JOIN vehicle_driver_assignments a ON a.id=e.assignment_id
        JOIN vehicles v ON v.id=a.vehicle_id JOIN drivers d ON d.id=a.driver_id
        ORDER BY e.assignment_id,e.recorded_at DESC`)).rows;
      return {locations:rows.map(r=>({...r,recordedAt:r.recordedAt.toISOString(),receivedAt:r.receivedAt.toISOString()}))};
    }));

  app.get("/shifts/:id/route",{preHandler:requireSession},async(request,reply)=>{
    const id=(request.params as {id?:string}).id;
    if(!id)return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    const route=await withTenantTransaction(user.tenantId,user.id,async client=>{
      const shift=(await client.query(`SELECT s.id,s.assignment_id AS "assignmentId",s.started_at AS "startedAt",s.ended_at AS "endedAt",
        v.plate AS "vehiclePlate",d.full_name AS "driverName"
        FROM work_shifts s JOIN vehicle_driver_assignments a ON a.id=s.assignment_id
        JOIN vehicles v ON v.id=a.vehicle_id JOIN drivers d ON d.id=a.driver_id WHERE s.id=$1`,[id])).rows[0];
      if(!shift)return null;
      const points=(await client.query(`SELECT id::text,latitude,longitude,accuracy_meters AS "accuracyMeters",
        speed_mps AS "speedMps",heading_degrees AS "headingDegrees",recorded_at AS "recordedAt"
        FROM location_events WHERE assignment_id=$1 AND recorded_at >= $2
        AND ($3::timestamptz IS NULL OR recorded_at <= $3) ORDER BY recorded_at ASC LIMIT 5000`,
        [shift.assignmentId,shift.startedAt,shift.endedAt])).rows;
      let distance=0,movingSeconds=0,stoppedSeconds=0;
      for(let index=1;index<points.length;index++){
        const previous=points[index-1]!,current=points[index]!;
        const seconds=Math.max(0,Math.min(300,(current.recordedAt.getTime()-previous.recordedAt.getTime())/1000));
        const segment=distanceMeters(previous,current);
        if(previous.accuracyMeters<=100&&current.accuracyMeters<=100&&segment<=5000)distance+=segment;
        if((current.speedMps??(seconds?segment/seconds:0))>=1) movingSeconds+=seconds; else stoppedSeconds+=seconds;
      }
      return {...shift,pointCount:points.length,distanceMeters:Math.round(distance),movingSeconds:Math.round(movingSeconds),stoppedSeconds:Math.round(stoppedSeconds),
        startedAt:shift.startedAt.toISOString(),endedAt:shift.endedAt?.toISOString()??null,
        points:points.map(point=>({...point,recordedAt:point.recordedAt.toISOString()}))};
    });
    return route?{route}:reply.code(404).send({error:"SHIFT_NOT_FOUND"});
  });
}
