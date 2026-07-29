-- QA storage buckets and policies for R&D import

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('MED', 'MED', false, null, null),
  ('vendor_documents', 'vendor_documents', false, 20971520, array['application/pdf','image/png','image/jpeg','text/csv']::text[]),
  ('db-backups', 'db-backups', false, 104857600, array['application/json']::text[]),
  ('invoices', 'invoices', false, 52428800, array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY "Authenticated Users can Delete Invoices" ON "storage"."objects" FOR DELETE TO "authenticated" USING (("bucket_id" = 'invoices'::"text"));

CREATE POLICY "Authenticated Users can Upload Invoices" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'invoices'::"text"));

CREATE POLICY "Authenticated users cannot read db backups" ON "storage"."objects" FOR SELECT TO "authenticated" USING (false);

CREATE POLICY "Public Avatars View" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'avatars'::"text"));

CREATE POLICY "Service role can manage db backups" ON "storage"."objects" TO "service_role" USING (("bucket_id" = 'db-backups'::"text")) WITH CHECK (("bucket_id" = 'db-backups'::"text"));

CREATE POLICY "Storage_Org_Isolation_Select" ON "storage"."objects" FOR SELECT USING ((("bucket_id" = 'avatars'::"text") AND (("public"."get_auth_role"() = 'platform_admin'::"text") OR (("storage"."foldername"("name"))[1] = ("public"."get_auth_org"())::"text"))));

CREATE POLICY "Tenant Isolation Avatars Delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'avatars'::"text") AND ("public"."is_platform_admin"() OR (("storage"."foldername"("name"))[1] = ("public"."get_my_org"())::"text"))));

CREATE POLICY "Tenant Isolation Avatars Insert" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'avatars'::"text") AND ("public"."is_platform_admin"() OR (("storage"."foldername"("name"))[1] = ("public"."get_my_org"())::"text")) AND "public"."check_file_security"("bucket_id", "metadata")));

CREATE POLICY "Tenant Isolation Avatars Update" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'avatars'::"text") AND ("public"."is_platform_admin"() OR (("storage"."foldername"("name"))[1] = ("public"."get_my_org"())::"text"))));

ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_bucket_org_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'invoices'::"text") AND ("auth"."uid"() IS NOT NULL) AND (("storage"."foldername"("name"))[1] = ("public"."get_auth_org"())::"text")));

CREATE POLICY "invoices_bucket_org_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'invoices'::"text") AND ("auth"."uid"() IS NOT NULL) AND (("storage"."foldername"("name"))[1] = ("public"."get_auth_org"())::"text")));

CREATE POLICY "invoices_bucket_org_read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'invoices'::"text") AND ("auth"."uid"() IS NOT NULL) AND (("storage"."foldername"("name"))[1] = ("public"."get_auth_org"())::"text")));

CREATE POLICY "invoices_bucket_service_role" ON "storage"."objects" TO "service_role" USING (("bucket_id" = 'invoices'::"text")) WITH CHECK (("bucket_id" = 'invoices'::"text"));

ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_documents_magic_link_upload" ON "storage"."objects" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("bucket_id" = 'vendor_documents'::"text") AND ("name" ~~ 'w9_documents/%'::"text") AND "public"."is_valid_vendor_document_upload_token"("name")));

CREATE POLICY "vendor_documents_manager_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'vendor_documents'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."vendor_documents" "vd"
  WHERE (("vd"."storage_path" = "objects"."name") AND ("vd"."deleted_at" IS NULL) AND "public"."reference_scope_writable"("vd"."organization_id", "vd"."brand_id", "vd"."location_id", "vd"."deleted_at", 'location_manager'::"text"))))));

CREATE POLICY "vendor_documents_manager_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'vendor_documents'::"text") AND ("name" ~ '^admin_uploads/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."vendors" "v"
  WHERE (("v"."id" = ("split_part"("objects"."name", '/'::"text", 2))::"uuid") AND "public"."reference_scope_writable"("v"."organization_id", "v"."brand_id", "v"."location_id", NULL::timestamp with time zone, 'location_manager'::"text"))))));

CREATE POLICY "vendor_documents_manager_read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'vendor_documents'::"text") AND "public"."is_manager_or_above"() AND (EXISTS ( SELECT 1
   FROM "public"."vendor_documents" "vd"
  WHERE (("vd"."storage_path" = "objects"."name") AND ("vd"."deleted_at" IS NULL) AND "public"."reference_scope_visible"("vd"."organization_id", "vd"."brand_id", "vd"."location_id", "vd"."deleted_at"))))));

CREATE POLICY "vendor_documents_manager_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'vendor_documents'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."vendor_documents" "vd"
  WHERE (("vd"."storage_path" = "objects"."name") AND ("vd"."deleted_at" IS NULL) AND "public"."reference_scope_writable"("vd"."organization_id", "vd"."brand_id", "vd"."location_id", "vd"."deleted_at", 'location_manager'::"text")))))) WITH CHECK ((("bucket_id" = 'vendor_documents'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."vendor_documents" "vd"
  WHERE (("vd"."storage_path" = "objects"."name") AND ("vd"."deleted_at" IS NULL) AND "public"."reference_scope_writable"("vd"."organization_id", "vd"."brand_id", "vd"."location_id", "vd"."deleted_at", 'location_manager'::"text"))))));
