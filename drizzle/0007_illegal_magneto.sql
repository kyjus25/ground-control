CREATE TABLE "compaction_metadata" (
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "compaction_metadata_user_id_thread_id_scope_namespace_key_pk" PRIMARY KEY("user_id","thread_id","scope","namespace","key")
);
--> statement-breakpoint
ALTER TABLE "compaction_metadata" ADD CONSTRAINT "compaction_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;