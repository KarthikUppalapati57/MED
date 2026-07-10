const fs = require('fs');
const src = 'code/supabase/migrations/20260710000006_business_verification_tenant_addresses_only.sql';
const out = 'code/supabase/migrations/20260710000008_business_verification_without_addresses.sql';
let text = fs.readFileSync(src, 'utf8');
const replace = (from, to) => {
  if (!text.includes(from)) throw new Error(`Missing expected text: ${from.slice(0, 180)}`);
  text = text.replace(from, to);
};
replace('-- Business verification should not collect or require hierarchy/location service addresses.\n-- Location business/service and mailing addresses are collected later in the hierarchy step.', '-- Business verification should not collect or require hierarchy addresses.\n-- Organization/location business and mailing addresses are collected later in the hierarchy step.');
replace('  v_business_address JSONB;\n  v_mailing_address JSONB;\n  v_same_mailing BOOLEAN;\n', '');
replace("  v_business_address := COALESCE(p_payload->'businessAddress', '{}'::jsonb);\n  v_same_mailing := COALESCE((p_payload->>'sameMailing')::boolean, true);\n  v_mailing_address := CASE\n    WHEN v_same_mailing THEN v_business_address\n    ELSE COALESCE(p_payload->'mailingAddress', '{}'::jsonb)\n  END;\n\n", '');
replace("\n  IF NULLIF(btrim(v_business_address->>'line1'), '') IS NULL\n     OR NULLIF(btrim(v_business_address->>'city'), '') IS NULL\n     OR NULLIF(btrim(v_business_address->>'state'), '') IS NULL\n     OR length(regexp_replace(COALESCE(v_business_address->>'zip', ''), '\\D', '', 'g')) < 5 THEN\n    RAISE EXCEPTION 'Business address must include street, city, state, and ZIP';\n  END IF;\n\n", '\n');
replace("  IF v_website IS NOT NULL THEN v_score := v_score + 10; END IF;\n  IF length(regexp_replace(COALESCE(v_business_address->>'zip', ''), '\\D', '', 'g')) >= 5 THEN v_score := v_score + 10; END IF;\n", "  IF v_website IS NOT NULL THEN v_score := v_score + 10; END IF;\n");
const deleteInsertStart = text.indexOf('  DELETE FROM public.organization_addresses\n  WHERE user_id = v_user_id\n    AND organization_id IS NULL;');
if (deleteInsertStart === -1) throw new Error('Missing organization_addresses block start');
const updateProfilesStart = text.indexOf('\n  UPDATE public.profiles', deleteInsertStart);
if (updateProfilesStart === -1) throw new Error('Missing UPDATE profiles after address block');
text = text.slice(0, deleteInsertStart) + text.slice(updateProfilesStart + 1);
fs.writeFileSync(out, text);
