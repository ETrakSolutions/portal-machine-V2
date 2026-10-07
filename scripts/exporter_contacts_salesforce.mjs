// Exporte les contacts Salesforce (lecture seule) pour publier_sav.py.
// Reutilise la connexion « gryb » de Salesforce CLI (`sf org login web --alias gryb`),
// la meme que le connecteur MCP Salesforce de Jacquot : aucun secret dans ce fichier.
// Usage : node scripts/exporter_contacts_salesforce.mjs <fichier_sortie.json>
import { createRequire } from "node:module";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const cli = join(process.env.LOCALAPPDATA, "Programs", "nodejs", "node_modules", "@salesforce", "cli", "package.json");
const { Org } = createRequire(cli)("@salesforce/core");
process.env.SF_DISABLE_TELEMETRY = "true";

const org = await Org.create({ aliasOrUsername: "gryb" });
const conn = org.getConnection();
await conn.refreshAuth();

let r = await conn.query(
  "SELECT Name, Title, Phone, MobilePhone, Email, LastModifiedDate, " +
  "Account.Name, Account.BillingCity, Account.ShippingCity FROM Contact WHERE IsDeleted = false");
const rows = [...r.records];
while (!r.done) { r = await conn.queryMore(r.nextRecordsUrl); rows.push(...r.records); }

writeFileSync(process.argv[2], JSON.stringify(rows.filter(c => c.Account).map(c => ({
  nom: c.Name, titre: c.Title, tel: c.Phone || c.MobilePhone, mail: c.Email, modif: c.LastModifiedDate,
  compte: c.Account.Name, ville: c.Account.BillingCity || c.Account.ShippingCity,
}))));
console.log(rows.length);
