const TOKEN=/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
export function templateVariables(value:string){return [...new Set([...value.matchAll(TOKEN)].map(match=>match[1]).filter((key):key is string=>Boolean(key)))];}
export function renderTemplate(value:string,variables:Record<string,string>){
 const missing=templateVariables(value).filter(key=>variables[key]===undefined);
 if(missing.length)throw new Error(`MISSING_TEMPLATE_VARIABLES:${missing.join(",")}`);
 return value.replace(TOKEN,(_,key:string)=>variables[key]!).replace(/[<>]/g,character=>character==="<"?"&lt;":"&gt;");
}
