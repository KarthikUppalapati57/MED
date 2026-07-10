const fs = require('fs');
const src = 'code/supabase/migrations/20260709000004_persist_onboarding_hierarchy_addresses.sql';
const out = 'code/supabase/migrations/20260710000007_hierarchy_required_org_location_addresses.sql';
let source = fs.readFileSync(src, 'utf8');
const start = source.indexOf('CREATE OR REPLACE FUNCTION public.setup_onboarding_hierarchy');
const endMarker = '\n$$;';
const end = source.indexOf(endMarker, start) + endMarker.length;
if (start < 0 || end < endMarker.length) throw new Error('Could not extract setup_onboarding_hierarchy');
let fn = source.slice(start, end);
fn = fn.replace(
  "    v_org_address := org_item#>'{metadata,organization_address}';",
  "    v_org_address := COALESCE(org_item#>'{metadata,organization_business_address}', org_item#>'{metadata,organization_address}');\n    v_mailing_address := CASE\n      WHEN COALESCE((org_item#>>'{metadata,organization_mailing_same_as_business}')::boolean, true) THEN v_org_address\n      ELSE org_item#>'{metadata,organization_mailing_address}'\n    END;"
);
fn = fn.replace(
  `    IF v_org_address IS NOT NULL AND COALESCE(jsonb_typeof(v_org_address), 'null') = 'object' THEN
      PERFORM public.insert_onboarding_address(
        p_user_id, v_org_id, NULL, NULL, 'service', v_org_name, v_org_address
      );
    END IF;`,
  `    IF v_org_address IS NULL OR COALESCE(jsonb_typeof(v_org_address), 'null') <> 'object' THEN
      RAISE EXCEPTION 'Organization % requires a business/service address', v_org_name;
    END IF;

    IF v_mailing_address IS NULL OR COALESCE(jsonb_typeof(v_mailing_address), 'null') <> 'object' THEN
      RAISE EXCEPTION 'Organization % requires a mailing address', v_org_name;
    END IF;

    PERFORM public.insert_onboarding_address(
      p_user_id, v_org_id, NULL, NULL, 'service', v_org_name, v_org_address
    );

    PERFORM public.insert_onboarding_address(
      p_user_id, v_org_id, NULL, NULL, 'mailing', v_org_name, v_mailing_address
    );`
);
fn = fn.replace(
  `        IF v_mailing_address IS NOT NULL AND COALESCE(jsonb_typeof(v_mailing_address), 'null') = 'object' THEN
          PERFORM public.insert_onboarding_address(
            p_user_id, v_org_id, v_brand_id, v_location_id, 'mailing', v_location_name, v_mailing_address
          );
        END IF;`,
  `        IF v_mailing_address IS NULL OR COALESCE(jsonb_typeof(v_mailing_address), 'null') <> 'object' THEN
          RAISE EXCEPTION 'Every location in brand % requires a mailing address', v_brand_name;
        END IF;

        PERFORM public.insert_onboarding_address(
          p_user_id, v_org_id, v_brand_id, v_location_id, 'mailing', v_location_name, v_mailing_address
        );`
);
const migration = `-- Align hierarchy onboarding with organization/location address capture.
-- Business identity remains identity-only; addresses are captured with the hierarchy.

${fn}

GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
`;
fs.writeFileSync(out, migration);
