import { ensureDemoWorkspaceRows, isPlatformAdminEmail, requireIdentity, runtimeEnv, saveMember, tenantEntitlementsFor, type Workspace } from "./platform-store";

type AdminIdentity = Awaited<ReturnType<typeof requireIdentity>>;

export type AdminTenant = {
  id:string; name:string; country:string; currency:string; createdAt:string; owner:string;
  plan:string; memberLimit:number; activeMembers:number; totalMembers:number; availableMembers:number;
  vehicleLimit:number; activeVehicles:number; providerReady:number; providerTotal:number;
  openTickets:number; status:"ACTIVE"|"SETUP"|"LIMITED"; updatedAt:string;
};

export type PlatformAdminSnapshot = {
  operator:{email:string;name:string;assuranceLevel:string;authSource:string};
  totals:{tenants:number;activeTenants:number;members:number;activeMembers:number;vehicles:number;openTickets:number;completedRevenueMinor:number;currency:string};
  tenants:AdminTenant[];
  members:Array<{tenantId:string;tenantName:string;email:string;name:string;role:string;team:string;title:string;active:boolean;inviteStatus:string;updatedAt:string}>;
  subscriptions:Array<{id:string;tenantId:string;tenantName:string;plan:string;period:string;seats:number;vehicles:number;amountMinor:number;currency:string;status:string;providerReference:string;createdAt:string;updatedAt:string}>;
  providers:Array<{tenantId:string;tenantName:string;provider:string;kind:string;status:string;lastCheckAt:string;updatedAt:string}>;
  tickets:Array<{id:string;tenantId:string;tenantName:string;requesterEmail:string;module:string;pageArea:string;type:string;priority:string;description:string;reference:string;status:string;createdAt:string}>;
  audit:Array<{id:string;tenantId:string;tenantName:string;actorEmail:string;action:string;module:string;recordId:string;createdAt:string}>;
  weeklyActivity:Array<{day:string;events:number;changes:number}>;
  moduleCounts:Array<{tenantId:string;module:string;count:number}>;
};

export async function requirePlatformAdmin(write=false):Promise<AdminIdentity>{
  const identity=await requireIdentity();
  const env=runtimeEnv();
  const isolatedDemoAdmin=identity.authSource==="DEMO"&&identity.email.toLowerCase()==="aydinalt@gmail.com";
  if(!isolatedDemoAdmin&&!isPlatformAdminEmail(identity.email,env))throw new Response("Bu hesap platform yönetimi için yetkili değildir.",{status:403});
  if(isolatedDemoAdmin){await ensureDemoWorkspaceRows(env.DB);return identity}
  if(identity.authSource!=="SUPABASE"||identity.assuranceLevel!=="aal2"){
    throw Response.json({error:`Platform verisini ${write?"değiştirmek":"görüntülemek"} için Supabase MFA ile AAL2 doğrulaması gereklidir.`,code:"MFA_REQUIRED",mfaUrl:"/security/mfa?returnTo=/admin"},{status:428});
  }
  return identity;
}

export async function platformAdminSnapshot(identity:AdminIdentity):Promise<PlatformAdminSnapshot>{
  const {DB}=runtimeEnv();
  const [tenantRows,memberRows,orderRows,providerRows,ticketRows,auditRows,moduleRows]=await Promise.all([
    DB.prepare("SELECT id,name,country,default_currency AS currency,created_at AS createdAt FROM tenants ORDER BY created_at DESC LIMIT 1000").all<{id:string;name:string;country:string;currency:string;createdAt:string}>(),
    DB.prepare("SELECT tenant_id AS tenantId,email,name,role,team,title,active,invite_status AS inviteStatus,updated_at AS updatedAt FROM tenant_members ORDER BY updated_at DESC LIMIT 5000").all<{tenantId:string;email:string;name:string;role:string;team:string;title:string;active:number;inviteStatus:string;updatedAt:string}>(),
    DB.prepare("SELECT id,tenant_id AS tenantId,plan,period,seats,vehicles,amount_minor AS amountMinor,currency,status,provider_reference AS providerReference,created_at AS createdAt,updated_at AS updatedAt FROM subscription_orders ORDER BY created_at DESC LIMIT 2000").all<{id:string;tenantId:string;plan:string;period:string;seats:number;vehicles:number;amountMinor:number;currency:string;status:string;providerReference:string;createdAt:string;updatedAt:string}>(),
    DB.prepare("SELECT tenant_id AS tenantId,provider,kind,status,last_check_at AS lastCheckAt,updated_at AS updatedAt FROM provider_connections ORDER BY updated_at DESC LIMIT 5000").all<{tenantId:string;provider:string;kind:string;status:string;lastCheckAt:string;updatedAt:string}>(),
    DB.prepare("SELECT id,tenant_id AS tenantId,requester_email AS requesterEmail,module,page_area AS pageArea,type,priority,description,reference,status,created_at AS createdAt FROM support_tickets ORDER BY created_at DESC LIMIT 2000").all<{id:string;tenantId:string;requesterEmail:string;module:string;pageArea:string;type:string;priority:string;description:string;reference:string;status:string;createdAt:string}>(),
    DB.prepare("SELECT id,tenant_id AS tenantId,actor_email AS actorEmail,action,module,record_id AS recordId,created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 500").all<{id:string;tenantId:string;actorEmail:string;action:string;module:string;recordId:string;createdAt:string}>(),
    DB.prepare("SELECT tenant_id AS tenantId,module,COUNT(*) AS count,MAX(updated_at) AS updatedAt FROM module_records WHERE archived=0 GROUP BY tenant_id,module").all<{tenantId:string;module:string;count:number;updatedAt:string}>(),
  ]);
  const demoTenantId=identity.authSource==="DEMO"?"TEN-DEMO":null;
  const visible=<T extends {tenantId:string}>(rows:T[])=>demoTenantId?rows.filter(row=>row.tenantId===demoTenantId):rows;
  const visibleTenants=demoTenantId?tenantRows.results.filter(row=>row.id===demoTenantId):tenantRows.results;
  const tenantNames=new Map(visibleTenants.map(row=>[row.id,row.name]));
  const entitlements=new Map(await Promise.all(visibleTenants.map(async row=>[row.id,await tenantEntitlementsFor(DB,row.id)] as const)));
  const members=visible(memberRows.results).map(row=>({...row,tenantName:tenantNames.get(row.tenantId)||row.tenantId,active:Boolean(row.active)}));
  const subscriptions=visible(orderRows.results).map(row=>({...row,tenantName:tenantNames.get(row.tenantId)||row.tenantId}));
  const providers=visible(providerRows.results).map(row=>({...row,tenantName:tenantNames.get(row.tenantId)||row.tenantId,lastCheckAt:row.lastCheckAt||""}));
  const tickets=visible(ticketRows.results).map(row=>({...row,tenantName:tenantNames.get(row.tenantId)||row.tenantId}));
  const audit=visible(auditRows.results).map(row=>({...row,tenantName:tenantNames.get(row.tenantId)||row.tenantId}));
  const visibleModules=visible(moduleRows.results);
  const tenants=visibleTenants.map(row=>{
    const limits=entitlements.get(row.id)!;
    const tenantMembers=members.filter(member=>member.tenantId===row.id);
    const tenantProviders=providers.filter(provider=>provider.tenantId===row.id);
    const tenantTickets=tickets.filter(ticket=>ticket.tenantId===row.id&&!new Set(["RESOLVED","CLOSED"]).has(ticket.status));
    const updated=[row.createdAt,...tenantMembers.map(member=>member.updatedAt),...tenantProviders.map(provider=>provider.updatedAt)].filter(Boolean).sort().at(-1)||row.createdAt;
    const providerReady=tenantProviders.filter(provider=>provider.status==="CONNECTED").length;
    const status:AdminTenant["status"]=limits.availableMembers===0&&tenantMembers.some(member=>!member.active)?"LIMITED":providerReady===0?"SETUP":"ACTIVE";
    return {...row,owner:tenantMembers.find(member=>member.role==="Owner")?.email||"—",plan:limits.plan,memberLimit:limits.memberLimit,activeMembers:limits.activeMembers,totalMembers:tenantMembers.length,availableMembers:limits.availableMembers,vehicleLimit:limits.vehicleLimit,activeVehicles:limits.activeVehicles,providerReady,providerTotal:tenantProviders.length,openTickets:tenantTickets.length,status,updatedAt:updated};
  });
  const today=new Date();
  const dayFormatter=new Intl.DateTimeFormat("tr-TR",{weekday:"short",timeZone:"Europe/Istanbul"});
  const weeklyActivity=Array.from({length:7},(_,index)=>{
    const date=new Date(today);date.setUTCDate(today.getUTCDate()-(6-index));
    const key=date.toISOString().slice(0,10),events=audit.filter(item=>item.createdAt.slice(0,10)===key);
    return {day:dayFormatter.format(date).replace(".",""),events:events.length,changes:events.filter(item=>/(CREATED|UPDATED|SAVED|TRANSITION|PURCHASED)/.test(item.action)).length};
  });
  const completed=subscriptions.filter(row=>row.status==="COMPLETED");
  return {
    operator:{email:identity.email,name:identity.name,assuranceLevel:identity.assuranceLevel,authSource:identity.authSource},
    totals:{tenants:tenants.length,activeTenants:tenants.filter(item=>item.status==="ACTIVE").length,members:members.length,activeMembers:members.filter(item=>item.active).length,vehicles:visibleModules.filter(item=>item.module==="fleet").reduce((sum,item)=>sum+Number(item.count),0),openTickets:tickets.filter(item=>!new Set(["RESOLVED","CLOSED"]).has(item.status)).length,completedRevenueMinor:completed.reduce((sum,item)=>sum+Number(item.amountMinor||0),0),currency:completed[0]?.currency||"TRY"},
    tenants,members,subscriptions,providers,tickets,audit,weeklyActivity,moduleCounts:visibleModules.map(({tenantId,module,count})=>({tenantId,module,count:Number(count)})),
  };
}

export async function platformAdminSaveMember(identity:AdminIdentity,input:Record<string,unknown>){
  const tenantId=String(input.tenantId||"").trim();
  if(identity.authSource==="DEMO"&&tenantId!=="TEN-DEMO")throw new Response("Demo yöneticisi yalnızca izole demo firmasını yönetebilir.",{status:403});
  const {DB}=runtimeEnv();
  const tenant=await DB.prepare("SELECT id,name FROM tenants WHERE id=?").bind(tenantId).first<{id:string;name:string}>();
  if(!tenant)throw new Response("Firma bulunamadı.",{status:404});
  const workspace:Workspace={tenantId:tenant.id,tenantName:tenant.name,email:identity.email,name:identity.name,role:"Admin",authSource:identity.authSource==="DEMO"?"DEMO":"SUPABASE",assuranceLevel:identity.authSource==="DEMO"?"demo":"aal2"};
  const member=await saveMember(workspace,input);
  await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'PLATFORM_ADMIN_MEMBER_UPDATED','users',?,?)")
    .bind(`AUD-${crypto.randomUUID()}`,tenantId,identity.email,member.email,JSON.stringify({role:member.role,active:member.active})).run();
  return member;
}
