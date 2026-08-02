import test from "node:test";
import assert from "node:assert/strict";
import {renderTemplate,templateVariables} from "../src/lib/template-renderer.js";

test("extracts unique declared template variables",()=>assert.deepEqual(templateVariables("{{title}} {{ title }} {{message}}"),["title","message"]));
test("renders known variables and escapes angle brackets",()=>assert.equal(renderTemplate("Merhaba {{name}}",{name:"<Aydın>"}),"Merhaba &lt;Aydın&gt;"));
test("rejects missing variables",()=>assert.throws(()=>renderTemplate("{{title}} - {{message}}",{title:"Uyarı"}),/MISSING_TEMPLATE_VARIABLES:message/));

