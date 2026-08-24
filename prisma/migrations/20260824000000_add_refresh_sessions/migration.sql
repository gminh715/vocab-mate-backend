CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_session_id" UUID,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_refresh_sessions_token_hash" ON "refresh_sessions"("token_hash");
CREATE UNIQUE INDEX "uq_refresh_sessions_replaced_by" ON "refresh_sessions"("replaced_by_session_id");
CREATE INDEX "idx_refresh_sessions_user_revoked" ON "refresh_sessions"("user_id", "revoked_at");

ALTER TABLE "refresh_sessions"
ADD CONSTRAINT "fk_refresh_sessions_user"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "refresh_sessions"
ADD CONSTRAINT "fk_refresh_sessions_replaced_by"
FOREIGN KEY ("replaced_by_session_id") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "refresh_sessions"
ADD CONSTRAINT "ck_refresh_sessions_expiry_after_creation"
CHECK ("expires_at" > "created_at");
