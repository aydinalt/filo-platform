const value=process.argv.find(arg=>arg.startsWith("--base-url="))?.slice("--base-url=".length)||process.env.PUBLIC_APP_ORIGIN;
if(!value)throw new Error("--base-url veya PUBLIC_APP_ORIGIN gerekli.");
const origin=new URL(value);
if(origin.protocol!=="https:")throw new Error("Üretim kontrolü yalnızca HTTPS üzerinde çalışır.");
const paths=["/","/api/public-legal?document=status"];
const checks=[];
for(const path of paths){
  const started=Date.now();
  try{
    const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(10000),redirect:"follow"});
    const body=await response.arrayBuffer();
    checks.push({path,status:response.status,latencyMs:Date.now()-started,cacheControl:response.headers.get("cache-control")||"",contentType:response.headers.get("content-type")||"",bodyBytes:body.byteLength,passed:response.ok&&body.byteLength>0});
  }catch(error){checks.push({path,status:0,latencyMs:Date.now()-started,error:error instanceof Error?error.message:"İstek başarısız.",passed:false})}
}
const result={format:"FILO_SYNTHETIC_PRODUCTION_CHECK_V1",origin:origin.origin,status:checks.every(x=>x.passed)?"PASSED":"FAILED",checkedAt:new Date().toISOString(),checks};
console.log(JSON.stringify(result,null,2));
if(result.status!=="PASSED")process.exitCode=1;
