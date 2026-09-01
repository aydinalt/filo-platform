type GeocodingEnv = {
  MAP_PROVIDER?: string;
  MAP_GEOCODING_API_URL?: string;
  MAP_GEOCODING_API_KEY?: string;
  MAP_GEOCODING_ALLOWED_HOSTS?: string;
};

export type GeocodingResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  provider: string;
};

function allowedHosts(env:GeocodingEnv){
  return new Set(String(env.MAP_GEOCODING_ALLOWED_HOSTS||"nominatim.openstreetmap.org").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean));
}

export function geocodingConfiguration(env:GeocodingEnv){
  const provider=String(env.MAP_PROVIDER||"").trim().toUpperCase();
  const endpoint=String(env.MAP_GEOCODING_API_URL||"https://nominatim.openstreetmap.org/search").trim();
  const missing:string[]=[];
  if(!["OPENSTREETMAP","CUSTOM_HTTP_V1"].includes(provider))missing.push("MAP_PROVIDER");
  let url:URL|undefined;
  try{url=new URL(endpoint)}catch{missing.push("MAP_GEOCODING_API_URL")}
  if(url&&(url.protocol!=="https:"||!allowedHosts(env).has(url.hostname.toLowerCase())))missing.push("MAP_GEOCODING_ALLOWED_HOSTS");
  if(provider==="CUSTOM_HTTP_V1"&&!String(env.MAP_GEOCODING_API_KEY||"").trim())missing.push("MAP_GEOCODING_API_KEY");
  return {provider,endpoint,configured:missing.length===0,missing:[...new Set(missing)]};
}

export async function geocodeAddress(env:GeocodingEnv,query:string,locale:string):Promise<GeocodingResult[]>{
  const config=geocodingConfiguration(env);
  if(!config.configured)throw new Response(`Geocoding yapılandırması eksik: ${config.missing.join(", ")}`,{status:503});
  const url=new URL(config.endpoint);url.searchParams.set("q",query);url.searchParams.set("format","jsonv2");url.searchParams.set("limit","5");url.searchParams.set("addressdetails","1");
  const headers:Record<string,string>={Accept:"application/json","Accept-Language":locale.startsWith("en")?"en":"tr","User-Agent":"FiloPlatform/1.28.6"};
  if(config.provider==="CUSTOM_HTTP_V1")headers.Authorization=`Bearer ${env.MAP_GEOCODING_API_KEY}`;
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Response("Geocoding sağlayıcısı yanıt vermedi.",{status:502});
  const payload=await response.json() as unknown;
  const rows=Array.isArray(payload)?payload:Array.isArray((payload as {results?:unknown[]})?.results)?(payload as {results:unknown[]}).results:[];
  return rows.slice(0,5).flatMap((value,index)=>{const row=value as Record<string,unknown>,latitude=Number(row.lat??row.latitude),longitude=Number(row.lon??row.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return [];const address=(row.address||{}) as Record<string,unknown>;return [{id:String(row.place_id||row.id||index),label:String(row.display_name||row.label||query).slice(0,300),latitude,longitude,countryCode:String(address.country_code||row.countryCode||"").toUpperCase(),provider:config.provider}]});
}
