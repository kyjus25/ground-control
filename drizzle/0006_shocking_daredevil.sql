CREATE TABLE "chat_members" (
	"chat_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	CONSTRAINT "chat_members_chat_id_bot_id_pk" PRIMARY KEY("chat_id","bot_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"sender_bot_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_chat_id_group_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."group_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_bot_id_bots_id_fk" FOREIGN KEY ("sender_bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at");