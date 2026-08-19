-- ============================================================================
-- Vocab Mate MVP - PostgreSQL Database Schema
-- Target: PostgreSQL 15+
-- Purpose: HTML-rendered article reader with sentence-scoped vocabulary metadata, CEFR highlights, user learning and quizzes
-- ============================================================================

-- Ghi chú: mỗi cột trong CREATE TABLE có comment tiếng Việt ngay cuối dòng.
-- Các comment chỉ phục vụ tài liệu hóa và không làm thay đổi cú pháp PostgreSQL.
BEGIN;

-- Required for UUID generation and case-insensitive text.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM (
    'ADMIN',
    'USER'
);

CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'DISABLED'
);

CREATE TYPE cefr_level AS ENUM (
    'A1',
    'A2',
    'B1',
    'B2',
    'C1',
    'C2'
);

CREATE TYPE article_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);


CREATE TYPE learning_status AS ENUM (
    'NEW',
    'LEARNING',
    'REVIEWING',
    'MASTERED',
    'IGNORED'
);

CREATE TYPE reading_status AS ENUM (
    'READING',
    'COMPLETED'
);

CREATE TYPE lexical_unit_type AS ENUM (
    'WORD',
    'PHRASE'
);

CREATE TYPE quiz_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

CREATE TYPE question_type AS ENUM (
    'SELECT_MEANING',
    'SELECT_WORD',
    'SELECT_CORRECT_CONTEXT',
    'FILL_BLANK'
);

CREATE TYPE review_session_type AS ENUM (
    'QUIZ',
    'DAILY_REVIEW',
    'ARTICLE_REVIEW',
    'COLLECTION_REVIEW'
);

CREATE TYPE review_session_status AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ABANDONED'
);

-- Temporary legacy type used while the compatibility tables below are
-- transformed into the current review schema before COMMIT.
CREATE TYPE review_item_type AS ENUM (
    'QUIZ_QUESTION'
);

CREATE TYPE question_generation_source AS ENUM (
    'ADMIN',
    'RULE_BASED',
    'AI'
);

CREATE TYPE review_session_item_status AS ENUM (
    'PENDING',
    'COMPLETED',
    'SKIPPED'
);

-- ============================================================================
-- AUTHENTICATION AND USER MANAGEMENT
-- ============================================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),                         -- Khóa chính UUID định danh duy nhất cho tài khoản.
    email               CITEXT NOT NULL,                                                    -- Email dùng để đăng nhập; CITEXT giúp so sánh không phân biệt hoa thường.
    password_hash       TEXT NOT NULL,                                                      -- Mật khẩu đã được băm; tuyệt đối không lưu mật khẩu dạng thuần.
    role                user_role NOT NULL DEFAULT 'USER',                                  -- Vai trò tài khoản, gồm ADMIN hoặc USER.
    status              user_status NOT NULL DEFAULT 'ACTIVE',                              -- Trạng thái hoạt động của tài khoản.
    last_login_at       TIMESTAMPTZ,                                                        -- Thời điểm tài khoản đăng nhập thành công gần nhất.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                 -- Thời điểm tài khoản được tạo.
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                 -- Thời điểm thông tin tài khoản được cập nhật gần nhất.

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_not_blank CHECK (btrim(email::TEXT) <> ''),
    CONSTRAINT ck_users_password_hash_not_blank CHECK (btrim(password_hash) <> '')
);

COMMENT ON TABLE users IS
'Authentication account, role and account status.';

CREATE TABLE user_profiles (
    user_id                 UUID PRIMARY KEY,                                               -- Khóa chính đồng thời là khóa ngoại liên kết một-một với users.
    display_name            TEXT NOT NULL,                                                  -- Tên hiển thị của người dùng trên giao diện.
    avatar_url              TEXT,                                                           -- Đường dẫn ảnh đại diện của người dùng.
    current_cefr_level      cefr_level NOT NULL,                                            -- Trình độ tiếng Anh CEFR hiện tại của người dùng.
    learning_goal           TEXT,                                                           -- Mục tiêu học tập do người dùng tự thiết lập.
    preferred_language      VARCHAR(20) NOT NULL DEFAULT 'vi',                              -- Chỉ là ngôn ngữ hiển thị giao diện người dùng.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm hồ sơ người dùng được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm hồ sơ được cập nhật gần nhất.

    CONSTRAINT fk_user_profiles_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT ck_user_profiles_display_name_not_blank
        CHECK (btrim(display_name) <> ''),

    CONSTRAINT ck_user_profiles_preferred_language_not_blank
        CHECK (btrim(preferred_language) <> '')
);

COMMENT ON TABLE user_profiles IS
'Personal profile and English-learning preferences for a user.';

-- ============================================================================
-- CATEGORY MANAGEMENT
-- ============================================================================

CREATE TABLE categories (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh danh mục bài báo.
    name                    TEXT NOT NULL,                                                  -- Tên danh mục hiển thị, ví dụ Technology hoặc Health.
    slug                    CITEXT NOT NULL,                                                -- Chuỗi định danh thân thiện dùng trên URL.
    description             TEXT,                                                           -- Mô tả ngắn về phạm vi nội dung của danh mục.
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,                                  -- Cho biết danh mục còn được phép sử dụng hay không.
    display_order           INTEGER NOT NULL DEFAULT 0,                                     -- Thứ tự ưu tiên khi hiển thị danh mục trên giao diện.
    created_by_user_id      UUID NOT NULL,                                                  -- Admin đã tạo danh mục.
    updated_by_user_id      UUID NOT NULL,                                                  -- Admin cập nhật danh mục gần nhất.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm danh mục được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm danh mục được cập nhật gần nhất.

    CONSTRAINT uq_categories_slug UNIQUE (slug),

    CONSTRAINT fk_categories_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_categories_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_categories_name_not_blank
        CHECK (btrim(name) <> ''),

    CONSTRAINT ck_categories_slug_not_blank
        CHECK (btrim(slug::TEXT) <> ''),

    CONSTRAINT ck_categories_display_order_non_negative
        CHECK (display_order >= 0)
);

COMMENT ON TABLE categories IS
'Primary article categories such as technology, economy and health.';

-- ============================================================================
-- ARTICLE MANAGEMENT
-- ============================================================================

CREATE TABLE articles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh bài báo.
    category_id             UUID NOT NULL,                                                  -- Danh mục chính mà bài báo thuộc về.
    title                   TEXT NOT NULL,                                                  -- Tiêu đề bài báo hiển thị cho người dùng.
    slug                    CITEXT NOT NULL,                                                -- Chuỗi định danh duy nhất dùng trong URL bài báo.
    summary                 TEXT NOT NULL,                                                  -- Phần tóm tắt do admin chuẩn bị để user xem trước khi đọc.
    content_html            TEXT NOT NULL,                                                  -- HTML đã sanitize và được backend gắn data-sentence-id/data-term-id; frontend render trực tiếp trường này.
    content_version         INTEGER NOT NULL DEFAULT 1,                                     -- Phiên bản nội dung, tăng khi HTML thay đổi và cache sentence/term cần được parse lại.
    source_name             TEXT,                                                           -- Tên nguồn hoặc trang báo gốc.
    source_url              TEXT,                                                           -- Đường dẫn đến bài viết gốc bên ngoài hệ thống.
    author_name             TEXT,                                                           -- Tên tác giả của bài báo gốc.
    thumbnail_url           TEXT,                                                           -- Đường dẫn ảnh đại diện hoặc ảnh thumbnail của bài báo.
    cefr_level              cefr_level NOT NULL,                                            -- Trình độ CEFR được admin gắn cho toàn bộ bài đọc.
    status                  article_status NOT NULL DEFAULT 'DRAFT',                        -- Trạng thái quản lý nội dung: DRAFT, PUBLISHED hoặc ARCHIVED.
    published_at            TIMESTAMPTZ,                                                    -- Thời điểm bài báo được xuất bản cho người dùng.
    archived_at             TIMESTAMPTZ,                                                    -- Thời điểm bài báo bị ẩn hoặc ngừng sử dụng.
    created_by_user_id      UUID NOT NULL,                                                  -- Admin đã tạo bài báo.
    updated_by_user_id      UUID NOT NULL,                                                  -- Admin cập nhật bài báo gần nhất.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm bản ghi bài báo được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm bài báo được cập nhật gần nhất.

    CONSTRAINT uq_articles_slug UNIQUE (slug),

    CONSTRAINT fk_articles_category
        FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_articles_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_articles_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_articles_title_not_blank
        CHECK (btrim(title) <> ''),

    CONSTRAINT ck_articles_slug_not_blank
        CHECK (btrim(slug::TEXT) <> ''),

    CONSTRAINT ck_articles_summary_not_blank
        CHECK (btrim(summary) <> ''),

    CONSTRAINT ck_articles_content_not_blank
        CHECK (btrim(content_html) <> ''),

    CONSTRAINT ck_articles_content_version_positive
        CHECK (content_version > 0),

    CONSTRAINT ck_articles_status_timestamps
        CHECK (
            (
                status = 'DRAFT'
                AND published_at IS NULL
                AND archived_at IS NULL
            )
            OR
            (
                status = 'PUBLISHED'
                AND published_at IS NOT NULL
                AND archived_at IS NULL
            )
            OR
            (
                status = 'ARCHIVED'
                AND archived_at IS NOT NULL
            )
        )
);

COMMENT ON TABLE articles IS
'Admin-managed English news articles and publication status.';

-- ============================================================================
-- ARTICLE SENTENCE AND CONTEXTUAL VOCABULARY MANAGEMENT
-- ============================================================================

CREATE TABLE article_sentences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID; chính giá trị này được gắn vào HTML dưới dạng data-sentence-id.
    article_id              UUID NOT NULL,                                                  -- Bài báo chứa câu này.
    content_version         INTEGER NOT NULL,                                               -- Phiên bản articles.content_html mà câu này thuộc về.
    sentence_order          INTEGER NOT NULL,                                               -- Thứ tự câu trong toàn bài, chỉ phục vụ admin xem và quản lý kết quả parse; frontend vẫn render theo content_html.
    sentence_text           TEXT NOT NULL,                                                  -- Nội dung plain text của câu; tương ứng parent.value trong response tra từ.
    translation_vi          TEXT,                                                           -- Bản dịch tiếng Việt của cả câu; admin có thể bổ sung sau khi parse.
    explanation_vi          TEXT,                                                           -- Giải thích ý nghĩa hoặc cấu trúc của câu; tương ứng parent.explanation.
    reference_explanation   TEXT,                                                           -- Giải thích đại từ, liên kết hoặc tham chiếu trong câu; tương ứng parent.reference.
    skill                   TEXT,                                                           -- Nhãn kỹ năng hoặc dạng câu hỏi nếu cần; giữ nguyên từ schema trước.
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,                                  -- Cho biết câu còn thuộc phiên bản HTML đang sử dụng hay không.
    created_by_user_id      UUID NOT NULL,                                                  -- Admin đã tạo bài hoặc xác nhận kết quả parse câu.
    updated_by_user_id      UUID NOT NULL,                                                  -- Admin cập nhật nội dung câu gần nhất.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm câu được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm câu được cập nhật gần nhất.

    CONSTRAINT uq_article_sentences_order
        UNIQUE (
            article_id,
            content_version,
            sentence_order
        ),

    CONSTRAINT fk_article_sentences_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_article_sentences_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_article_sentences_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_article_sentences_content_version_positive
        CHECK (content_version > 0),

    CONSTRAINT ck_article_sentences_order_positive
        CHECK (sentence_order > 0),

    CONSTRAINT ck_article_sentences_text_not_blank
        CHECK (btrim(sentence_text) <> ''),

    CONSTRAINT ck_article_sentences_translation_not_blank
        CHECK (
            translation_vi IS NULL
            OR btrim(translation_vi) <> ''
        )
);

COMMENT ON TABLE article_sentences IS
'Sentences parsed from article HTML. Their UUID values are embedded in articles.content_html as data-sentence-id markers.';


CREATE TABLE article_sentence_terms (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID; chính giá trị này được gắn vào HTML dưới dạng data-term-id cho vùng từ có thể click.
    sentence_id             UUID NOT NULL,                                                  -- Câu cha chứa từ; dùng để dựng đối tượng parent trong response tra cứu.
    value                   TEXT NOT NULL,                                                  -- Dạng chữ xuất hiện trong sentence_text, ví dụ harmful hoặc crop yields.
    word_display            TEXT,                                                           -- Dạng chữ hiển thị được bổ sung khi tra cứu lần đầu.
    lemma                   TEXT NOT NULL,                                                  -- Dạng từ điển được cache cho từ trong câu, ví dụ harmful hoặc take into account.
    normalized_lemma        CITEXT,                                                         -- Lemma chuẩn hóa được bổ sung khi tra cứu lần đầu.
    unit_type               lexical_unit_type NOT NULL DEFAULT 'WORD',                      -- Phân loại đơn vị được cache là WORD hoặc PHRASE.
    part_of_speech          TEXT,                                                           -- Từ loại được bổ sung khi tra cứu lần đầu.
    ipa                     TEXT,                                                           -- Phiên âm IPA của từ hoặc cụm từ trong cache của câu này.
    cefr_level              cefr_level,                                                     -- CEFR được bổ sung khi tra cứu lần đầu.
    contextual_meaning_vi   TEXT,                                                           -- Nghĩa tiếng Việt được bổ sung khi tra cứu lần đầu.
    definition_en           TEXT,                                                           -- Định nghĩa tiếng Anh của từ theo ngữ cảnh hiện tại.
    contextual_explanation  TEXT,                                                           -- Giải thích cách dùng và lý do từ mang nghĩa này trong câu.
    synonyms                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],                        -- Danh sách từ đồng nghĩa đã cache cho từ trong câu.
    antonyms                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],                        -- Danh sách từ trái nghĩa đã cache cho từ trong câu.
    collocations            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],                        -- Danh sách collocation đã cache cho từ trong câu.
    related_terms           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],                        -- Danh sách từ hoặc cụm từ liên quan.
    vocabulary_topic        TEXT,                                                           -- Chủ đề riêng của từ vựng nếu cần phân loại.
    examples                JSONB NOT NULL DEFAULT '[]'::JSONB,                             -- Danh sách câu ví dụ và bản dịch được cache trực tiếp cùng từ.
    skill                   TEXT,                                                           -- Nhãn kỹ năng nếu cần để tương thích response hoặc nội dung quản trị.
    is_lookup_enabled       BOOLEAN NOT NULL DEFAULT TRUE,                                  -- Cho biết vùng HTML data-term-id của từ này có cho phép user click tra cứu hay không.
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,                                  -- Cho biết cache từ trong câu còn được sử dụng hay không.
    created_by_user_id      UUID NOT NULL,                                                  -- Admin đã bổ sung metadata cho từ trong câu.
    updated_by_user_id      UUID NOT NULL,                                                  -- Admin cập nhật metadata từ gần nhất.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm cache từ trong câu được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm cache từ trong câu được cập nhật gần nhất.

    CONSTRAINT fk_article_sentence_terms_sentence
        FOREIGN KEY (sentence_id)
        REFERENCES article_sentences(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_article_sentence_terms_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_article_sentence_terms_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_article_sentence_terms_value_not_blank
        CHECK (btrim(value) <> ''),

    CONSTRAINT ck_article_sentence_terms_word_display_not_blank
        CHECK (word_display IS NULL OR btrim(word_display) <> ''),

    CONSTRAINT ck_article_sentence_terms_lemma_not_blank
        CHECK (btrim(lemma) <> ''),

    CONSTRAINT ck_article_sentence_terms_normalized_lemma_not_blank
        CHECK (normalized_lemma IS NULL OR btrim(normalized_lemma::TEXT) <> ''),

    CONSTRAINT ck_article_sentence_terms_part_of_speech_not_blank
        CHECK (part_of_speech IS NULL OR btrim(part_of_speech) <> ''),

    CONSTRAINT ck_article_sentence_terms_meaning_not_blank
        CHECK (contextual_meaning_vi IS NULL OR btrim(contextual_meaning_vi) <> ''),

    CONSTRAINT ck_article_sentence_terms_examples_array
        CHECK (jsonb_typeof(examples) = 'array')
);

COMMENT ON TABLE article_sentence_terms IS
'Admin-added contextual word or phrase metadata. The term UUID is embedded in articles.content_html as data-term-id; no character offsets are stored.';

-- ============================================================================
-- USER READING AND VOCABULARY DATA
-- ============================================================================

CREATE TABLE user_article_progress (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh tiến độ đọc.
    user_id                 UUID NOT NULL,                                                  -- Người dùng đang đọc bài báo.
    article_id              UUID NOT NULL,                                                  -- Bài báo được theo dõi tiến độ.
    status                  reading_status NOT NULL DEFAULT 'READING',                      -- Trạng thái đọc hiện tại: READING hoặc COMPLETED.
    first_opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm user mở bài báo lần đầu.
    last_read_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm user đọc bài gần nhất.
    completed_at            TIMESTAMPTZ,                                                    -- Thời điểm user hoàn thành bài đọc.
    last_block_key          TEXT,                                                           -- Mã đoạn HTML gần nhất mà user đã đọc đến.
    progress_percent        NUMERIC(5,2),                                                   -- Phần trăm tiến độ đọc từ 0 đến 100.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm bản ghi tiến độ được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm tiến độ đọc được cập nhật gần nhất.

    CONSTRAINT uq_user_article_progress_user_article
        UNIQUE (user_id, article_id),

    CONSTRAINT fk_user_article_progress_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_user_article_progress_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_user_article_progress_percent
        CHECK (
            progress_percent IS NULL
            OR (progress_percent >= 0 AND progress_percent <= 100)
        ),

    CONSTRAINT ck_user_article_progress_status
        CHECK (
            (
                status = 'READING'
                AND completed_at IS NULL
            )
            OR
            (
                status = 'COMPLETED'
                AND completed_at IS NOT NULL
            )
        )
);

COMMENT ON TABLE user_article_progress IS
'Current reading progress of one user for one article.';

CREATE TABLE user_vocabularies (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),                 -- Khóa chính UUID định danh một từ theo ngữ cảnh trong danh sách học cá nhân.
    user_id                     UUID NOT NULL,                                              -- Người dùng sở hữu từ vựng đã lưu.
    article_sentence_term_id    UUID NOT NULL,                                              -- Cache từ trong câu mà user đã bấm lưu; không tham chiếu bảng từ dùng chung.
    learning_status             learning_status NOT NULL DEFAULT 'NEW',                     -- Trạng thái học cá nhân của từ theo ngữ cảnh này.
    personal_note               TEXT,                                                       -- Ghi chú riêng do user nhập.
    saved_word_display          TEXT NOT NULL,                                              -- Snapshot từ hoặc cụm từ hiển thị tại thời điểm lưu.
    saved_lemma                 TEXT NOT NULL,                                              -- Snapshot lemma tại thời điểm lưu.
    saved_part_of_speech        TEXT NOT NULL,                                              -- Snapshot từ loại tại thời điểm lưu.
    saved_ipa                   TEXT,                                                       -- Snapshot phiên âm IPA tại thời điểm lưu.
    saved_cefr_level            cefr_level NOT NULL,                                        -- Snapshot CEFR tại thời điểm lưu.
    saved_context_sentence      TEXT NOT NULL,                                              -- Snapshot câu tiếng Anh chứa từ tại thời điểm lưu.
    saved_context_translation_vi TEXT NOT NULL,                                             -- Snapshot bản dịch tiếng Việt của câu tại thời điểm lưu.
    saved_meaning_vi            TEXT NOT NULL,                                              -- Snapshot nghĩa tiếng Việt của từ trong câu tại thời điểm lưu.
    saved_explanation           TEXT,                                                       -- Snapshot giải thích nghĩa theo ngữ cảnh tại thời điểm lưu.
    saved_examples              JSONB NOT NULL DEFAULT '[]'::JSONB,                         -- Snapshot danh sách câu ví dụ tại thời điểm lưu.
    saved_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm user lưu từ vào danh sách học.
    last_reviewed_at            TIMESTAMPTZ,                                                -- Thời điểm từ được user ôn gần nhất.
    next_review_at              TIMESTAMPTZ,                                                -- Thời điểm hệ thống dự kiến cho lần ôn tiếp theo.
    review_interval_days        INTEGER,                                                    -- Khoảng cách tính bằng ngày giữa các lần ôn hiện tại.
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm bản ghi từ cá nhân được tạo.
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm trạng thái hoặc ghi chú được cập nhật gần nhất.

    CONSTRAINT uq_user_vocabularies_user_sentence_term
        UNIQUE (user_id, article_sentence_term_id),

    CONSTRAINT fk_user_vocabularies_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_user_vocabularies_article_sentence_term
        FOREIGN KEY (article_sentence_term_id)
        REFERENCES article_sentence_terms(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_user_vocabularies_word_display_not_blank
        CHECK (btrim(saved_word_display) <> ''),

    CONSTRAINT ck_user_vocabularies_lemma_not_blank
        CHECK (btrim(saved_lemma) <> ''),

    CONSTRAINT ck_user_vocabularies_part_of_speech_not_blank
        CHECK (btrim(saved_part_of_speech) <> ''),

    CONSTRAINT ck_user_vocabularies_context_not_blank
        CHECK (btrim(saved_context_sentence) <> ''),

    CONSTRAINT ck_user_vocabularies_context_translation_not_blank
        CHECK (btrim(saved_context_translation_vi) <> ''),

    CONSTRAINT ck_user_vocabularies_meaning_not_blank
        CHECK (btrim(saved_meaning_vi) <> ''),

    CONSTRAINT ck_user_vocabularies_examples_array
        CHECK (jsonb_typeof(saved_examples) = 'array'),

    CONSTRAINT ck_user_vocabularies_review_interval
        CHECK (
            review_interval_days IS NULL
            OR review_interval_days >= 0
        )
);

COMMENT ON TABLE user_vocabularies IS
'User-saved contextual vocabulary referencing a sentence-scoped cache and retaining snapshots for review.';

CREATE TABLE vocabulary_collections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh một bộ sưu tập từ vựng của user.
    user_id                 UUID NOT NULL,                                                  -- Người dùng sở hữu bộ sưu tập.
    name                    TEXT NOT NULL,                                                  -- Tên bộ sưu tập, ví dụ Technology hoặc Difficult Words.
    description             TEXT,                                                           -- Mô tả tùy chọn cho mục đích của bộ sưu tập.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm bộ sưu tập được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm bộ sưu tập được cập nhật gần nhất.

    CONSTRAINT uq_vocabulary_collections_user_name
        UNIQUE (user_id, name),

    CONSTRAINT fk_vocabulary_collections_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT ck_vocabulary_collections_name_not_blank
        CHECK (btrim(name) <> '')
);

COMMENT ON TABLE vocabulary_collections IS
'User-defined folders used to organize saved vocabulary.';

CREATE TABLE vocabulary_collection_items (
    collection_id           UUID NOT NULL,                                                  -- Bộ sưu tập nhận từ vựng.
    user_vocabulary_id      UUID NOT NULL,                                                  -- Từ vựng cá nhân được thêm vào bộ sưu tập.
    added_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm từ được thêm vào bộ sưu tập.

    CONSTRAINT pk_vocabulary_collection_items
        PRIMARY KEY (collection_id, user_vocabulary_id),

    CONSTRAINT fk_vocabulary_collection_items_collection
        FOREIGN KEY (collection_id)
        REFERENCES vocabulary_collections(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_vocabulary_collection_items_user_vocabulary
        FOREIGN KEY (user_vocabulary_id)
        REFERENCES user_vocabularies(id)
        ON DELETE CASCADE
);

COMMENT ON TABLE vocabulary_collection_items IS
'Many-to-many relation allowing one saved vocabulary item to belong to multiple collections.';

-- ============================================================================
-- QUIZ AND QUESTION MANAGEMENT
-- ============================================================================

CREATE TABLE quizzes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh bộ quiz.
    article_id              UUID NOT NULL,                                                  -- Bài báo mà quiz dùng để ôn tập.
    title                   TEXT NOT NULL,                                                  -- Tiêu đề của quiz.
    description             TEXT,                                                           -- Mô tả mục tiêu hoặc nội dung của quiz.
    status                  quiz_status NOT NULL DEFAULT 'DRAFT',                           -- Trạng thái quản lý quiz: DRAFT, PUBLISHED hoặc ARCHIVED.
    published_at            TIMESTAMPTZ,                                                    -- Thời điểm quiz được xuất bản cho user.
    created_by_user_id      UUID NOT NULL,                                                  -- Admin đã tạo quiz.
    updated_by_user_id      UUID NOT NULL,                                                  -- Admin cập nhật quiz gần nhất.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm quiz được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm quiz được cập nhật gần nhất.

    CONSTRAINT fk_quizzes_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_quizzes_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_quizzes_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_quizzes_title_not_blank
        CHECK (btrim(title) <> ''),

    CONSTRAINT ck_quizzes_status_published_at
        CHECK (
            (
                status = 'DRAFT'
                AND published_at IS NULL
            )
            OR
            (
                status = 'PUBLISHED'
                AND published_at IS NOT NULL
            )
            OR
            status = 'ARCHIVED'
        )
);

COMMENT ON TABLE quizzes IS
'Admin-created quiz collection associated with an article.';

CREATE TABLE quiz_questions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),                 -- Khóa chính UUID định danh câu hỏi.
    quiz_id                     UUID NOT NULL,                                              -- Quiz chứa câu hỏi này.
    article_vocabulary_id       UUID NOT NULL,                                              -- Từ hoặc cụm từ theo ngữ cảnh câu mà câu hỏi kiểm tra.
    question_type               question_type NOT NULL,                                     -- Loại câu hỏi như chọn nghĩa, chọn từ hoặc điền từ.
    prompt                      TEXT NOT NULL,                                              -- Nội dung yêu cầu hoặc câu hỏi hiển thị cho user.
    blank_sentence              TEXT,                                                       -- Câu chứa chỗ trống, dùng cho dạng FILL_BLANK.
    correct_answer_text         TEXT,                                                       -- Đáp án dạng văn bản, chủ yếu dùng cho câu điền từ.
    answer_explanation          TEXT,                                                       -- Giải thích vì sao đáp án đúng.
    is_case_sensitive           BOOLEAN NOT NULL DEFAULT FALSE,                             -- Cho biết chấm câu trả lời text có phân biệt hoa thường hay không.
    points                      INTEGER NOT NULL DEFAULT 1,                                 -- Số điểm của câu hỏi.
    display_order               INTEGER NOT NULL DEFAULT 1,                                 -- Thứ tự hiển thị câu hỏi trong quiz.
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,                              -- Cho biết câu hỏi còn được sử dụng hay không.
    created_by_user_id          UUID NOT NULL,                                              -- Admin đã tạo câu hỏi.
    updated_by_user_id          UUID NOT NULL,                                              -- Admin cập nhật câu hỏi gần nhất.
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm câu hỏi được tạo.
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm câu hỏi được cập nhật gần nhất.

    CONSTRAINT uq_quiz_questions_display_order
        UNIQUE (quiz_id, display_order),

    CONSTRAINT fk_quiz_questions_quiz
        FOREIGN KEY (quiz_id)
        REFERENCES quizzes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_quiz_questions_article_vocabulary
        FOREIGN KEY (article_vocabulary_id)
        REFERENCES article_sentence_terms(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_quiz_questions_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_quiz_questions_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_quiz_questions_prompt_not_blank
        CHECK (btrim(prompt) <> ''),

    CONSTRAINT ck_quiz_questions_points_positive
        CHECK (points > 0),

    CONSTRAINT ck_quiz_questions_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT ck_quiz_questions_fill_blank_fields
        CHECK (
            question_type <> 'FILL_BLANK'
            OR (
                blank_sentence IS NOT NULL
                AND btrim(blank_sentence) <> ''
                AND correct_answer_text IS NOT NULL
                AND btrim(correct_answer_text) <> ''
            )
        )
);

COMMENT ON TABLE quiz_questions IS
'Vocabulary review question associated with a quiz and article context.';

CREATE TABLE question_options (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh một lựa chọn trả lời.
    quiz_question_id        UUID NOT NULL,                                                  -- Câu hỏi trắc nghiệm sở hữu lựa chọn này.
    option_text             TEXT NOT NULL,                                                  -- Nội dung của lựa chọn.
    is_correct              BOOLEAN NOT NULL DEFAULT FALSE,                                 -- Đánh dấu lựa chọn này có phải đáp án đúng hay không.
    explanation             TEXT,                                                           -- Giải thích riêng cho lựa chọn nếu cần.
    display_order           INTEGER NOT NULL DEFAULT 1,                                     -- Thứ tự hiển thị lựa chọn.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm lựa chọn được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm lựa chọn được cập nhật gần nhất.

    CONSTRAINT uq_question_options_display_order
        UNIQUE (quiz_question_id, display_order),

    CONSTRAINT fk_question_options_question
        FOREIGN KEY (quiz_question_id)
        REFERENCES quiz_questions(id)
        ON DELETE CASCADE,

    CONSTRAINT ck_question_options_text_not_blank
        CHECK (btrim(option_text) <> ''),

    CONSTRAINT ck_question_options_display_order_positive
        CHECK (display_order > 0)
);

COMMENT ON TABLE question_options IS
'Multiple-choice options for a quiz question.';

-- ============================================================================
-- LEARNING HISTORY
-- ============================================================================

CREATE TABLE review_sessions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),                     -- Khóa chính UUID định danh một phiên học hoặc ôn tập.
    user_id                 UUID NOT NULL,                                                  -- Người dùng thực hiện phiên học.
    session_type            review_session_type NOT NULL,                                   -- Loại phiên ôn tập bằng quiz.
    quiz_id                 UUID,                                                           -- Quiz được sử dụng trong phiên.
    article_id              UUID,                                                           -- Bài báo liên quan đến phiên học nếu user ôn theo bài.
    status                  review_session_status NOT NULL DEFAULT 'IN_PROGRESS',           -- Trạng thái thực hiện của phiên học.
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm phiên học bắt đầu.
    completed_at            TIMESTAMPTZ,                                                    -- Thời điểm phiên học hoàn thành.
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm bản ghi phiên học được tạo.
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),                             -- Thời điểm phiên học được cập nhật gần nhất.

    CONSTRAINT fk_review_sessions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_sessions_quiz
        FOREIGN KEY (quiz_id)
        REFERENCES quizzes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_sessions_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_review_sessions_quiz_requirement
        CHECK (
            session_type <> 'QUIZ'
            OR quiz_id IS NOT NULL
        ),

    CONSTRAINT ck_review_sessions_status_time
        CHECK (
            (
                status = 'IN_PROGRESS'
                AND completed_at IS NULL
            )
            OR
            (
                status = 'COMPLETED'
                AND completed_at IS NOT NULL
            )
            OR
            status = 'ABANDONED'
        )
);

COMMENT ON TABLE review_sessions IS
'One user quiz learning session.';

CREATE TABLE review_answers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),                 -- Khóa chính UUID định danh một lần trả lời hoặc tự đánh giá.
    review_session_id           UUID NOT NULL,                                              -- Phiên học chứa lần tương tác này.
    article_vocabulary_id       UUID NOT NULL,                                              -- Từ hoặc cụm từ theo ngữ cảnh câu được ôn trong lần tương tác.
    user_vocabulary_id          UUID,                                                       -- Bản ghi từ cá nhân nếu user đã lưu từ; có thể null.
    item_type                   review_item_type NOT NULL,                                  -- Loại item được ôn: QUIZ_QUESTION.
    quiz_question_id            UUID,                                                       -- Câu hỏi được trả lời; chỉ có giá trị với item QUIZ_QUESTION.
    selected_option_id          UUID,                                                       -- Lựa chọn mà user đã chọn trong câu hỏi trắc nghiệm.
    user_answer_text            TEXT,                                                       -- Nội dung user nhập cho câu hỏi dạng text hoặc điền từ.
    is_correct                  BOOLEAN,                                                    -- Kết quả đúng hoặc sai của câu hỏi.
    response_time_ms            INTEGER,                                                    -- Thời gian phản hồi của user tính bằng mili giây.
    attempt_number              INTEGER NOT NULL DEFAULT 1,                                 -- Số thứ tự lần thử của user với cùng item.
    answered_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm user gửi câu trả lời hoặc mức tự đánh giá.
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),                         -- Thời điểm bản ghi lịch sử được tạo.

    CONSTRAINT fk_review_answers_session
        FOREIGN KEY (review_session_id)
        REFERENCES review_sessions(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_answers_article_vocabulary
        FOREIGN KEY (article_vocabulary_id)
        REFERENCES article_sentence_terms(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_answers_user_vocabulary
        FOREIGN KEY (user_vocabulary_id)
        REFERENCES user_vocabularies(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_answers_quiz_question
        FOREIGN KEY (quiz_question_id)
        REFERENCES quiz_questions(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_review_answers_selected_option
        FOREIGN KEY (selected_option_id)
        REFERENCES question_options(id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_review_answers_response_time
        CHECK (
            response_time_ms IS NULL
            OR response_time_ms >= 0
        ),

    CONSTRAINT ck_review_answers_attempt_number_positive
        CHECK (attempt_number > 0),

    CONSTRAINT ck_review_answers_item_shape
        CHECK (
            item_type = 'QUIZ_QUESTION'
            AND quiz_question_id IS NOT NULL
            AND is_correct IS NOT NULL
            AND (
                selected_option_id IS NOT NULL
                OR (
                    user_answer_text IS NOT NULL
                    AND btrim(user_answer_text) <> ''
                )
            )
        )
);

COMMENT ON TABLE review_answers IS
'Immutable history of each quiz answer in a review session.';

-- ============================================================================
-- INDEXES
-- Unique constraints already create indexes. The following indexes support
-- common filter, ownership, review scheduling and dashboard queries.
-- ============================================================================

CREATE INDEX idx_categories_active_order
    ON categories (is_active, display_order);

CREATE INDEX idx_articles_published_filters
    ON articles (category_id, cefr_level, published_at DESC)
    WHERE status = 'PUBLISHED';

CREATE INDEX idx_articles_created_by
    ON articles (created_by_user_id, created_at DESC);

CREATE INDEX idx_article_sentences_article_active_order
    ON article_sentences (
        article_id,
        content_version,
        is_active,
        sentence_order
    );

CREATE INDEX idx_article_sentence_terms_cefr_active
    ON article_sentence_terms (cefr_level, is_active, is_lookup_enabled);

CREATE INDEX idx_article_sentence_terms_sentence_lookup
    ON article_sentence_terms (
        sentence_id,
        is_lookup_enabled,
        is_active
    );

CREATE UNIQUE INDEX uq_article_sentence_terms_value
    ON article_sentence_terms (
        sentence_id,
        LOWER(BTRIM(value)),
        part_of_speech,
        unit_type
    );

CREATE INDEX idx_article_sentence_terms_normalized_lemma
    ON article_sentence_terms (normalized_lemma, part_of_speech);

CREATE INDEX idx_user_article_progress_user_status
    ON user_article_progress (user_id, status, last_read_at DESC);

CREATE INDEX idx_user_vocabularies_user_status_saved
    ON user_vocabularies (user_id, learning_status, saved_at DESC);

CREATE INDEX idx_user_vocabularies_due_review
    ON user_vocabularies (user_id, next_review_at)
    WHERE next_review_at IS NOT NULL
      AND learning_status IN ('NEW', 'LEARNING', 'REVIEWING');

CREATE INDEX idx_user_vocabularies_sentence_term
    ON user_vocabularies (article_sentence_term_id);

CREATE INDEX idx_vocabulary_collections_user
    ON vocabulary_collections (user_id, created_at DESC);

CREATE INDEX idx_vocabulary_collection_items_vocabulary
    ON vocabulary_collection_items (user_vocabulary_id);

CREATE INDEX idx_quizzes_article_status
    ON quizzes (article_id, status);

CREATE INDEX idx_quiz_questions_vocabulary
    ON quiz_questions (article_vocabulary_id);

CREATE INDEX idx_question_options_question_correct
    ON question_options (quiz_question_id, is_correct);

CREATE INDEX idx_review_sessions_user_started
    ON review_sessions (user_id, started_at DESC);

CREATE INDEX idx_review_sessions_quiz
    ON review_sessions (quiz_id)
    WHERE quiz_id IS NOT NULL;

CREATE INDEX idx_review_answers_session_answered
    ON review_answers (review_session_id, answered_at);

CREATE INDEX idx_review_answers_vocabulary_answered
    ON review_answers (article_vocabulary_id, answered_at DESC);

CREATE INDEX idx_review_answers_user_vocabulary
    ON review_answers (user_vocabulary_id, answered_at DESC)
    WHERE user_vocabulary_id IS NOT NULL;

CREATE INDEX idx_review_answers_quiz_dashboard
    ON review_answers (review_session_id, is_correct)
    WHERE item_type = 'QUIZ_QUESTION';

-- ============================================================================
-- AUTOMATIC updated_at TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_profiles_set_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_articles_set_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_article_sentences_set_updated_at
BEFORE UPDATE ON article_sentences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_article_sentence_terms_set_updated_at
BEFORE UPDATE ON article_sentence_terms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_article_progress_set_updated_at
BEFORE UPDATE ON user_article_progress
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_vocabularies_set_updated_at
BEFORE UPDATE ON user_vocabularies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER trg_vocabulary_collections_set_updated_at
BEFORE UPDATE ON vocabulary_collections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_quizzes_set_updated_at
BEFORE UPDATE ON quizzes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_quiz_questions_set_updated_at
BEFORE UPDATE ON quiz_questions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_question_options_set_updated_at
BEFORE UPDATE ON question_options
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_review_sessions_set_updated_at
BEFORE UPDATE ON review_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- CURRENT SPACED-REVIEW AND GENERATED-QUESTION SHAPE
-- The base definitions above retain the original MVP creation order. These
-- transformations leave a new database in the same final shape as the
-- committed Prisma migrations.
-- ============================================================================

ALTER TABLE user_vocabularies
ADD COLUMN consecutive_correct_reviews SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN lapse_count SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN last_review_score SMALLINT,
ADD CONSTRAINT ck_user_vocabularies_consecutive_correct_reviews_non_negative
    CHECK (consecutive_correct_reviews >= 0),
ADD CONSTRAINT ck_user_vocabularies_lapse_count_non_negative
    CHECK (lapse_count >= 0),
ADD CONSTRAINT ck_user_vocabularies_last_review_score
    CHECK (last_review_score IS NULL OR last_review_score BETWEEN 0 AND 5);

DROP INDEX idx_user_vocabularies_due_review;
CREATE INDEX idx_user_vocabularies_due_review
ON user_vocabularies (user_id, lapse_count DESC, next_review_at)
WHERE learning_status IN ('NEW', 'LEARNING', 'REVIEWING');

ALTER TABLE quiz_questions
ADD COLUMN article_sentence_term_id UUID,
ADD COLUMN generation_source question_generation_source NOT NULL DEFAULT 'ADMIN',
ADD COLUMN difficulty_cefr cefr_level;

UPDATE quiz_questions
SET article_sentence_term_id = article_vocabulary_id;

UPDATE quiz_questions AS question
SET difficulty_cefr = COALESCE(term.cefr_level, article.cefr_level)
FROM article_sentence_terms AS term
JOIN article_sentences AS sentence ON sentence.id = term.sentence_id
JOIN articles AS article ON article.id = sentence.article_id
WHERE question.article_vocabulary_id = term.id;

ALTER TABLE quiz_questions
ALTER COLUMN article_sentence_term_id SET NOT NULL,
ALTER COLUMN difficulty_cefr SET NOT NULL,
ALTER COLUMN quiz_id DROP NOT NULL,
ALTER COLUMN created_by_user_id DROP NOT NULL,
ALTER COLUMN updated_by_user_id DROP NOT NULL,
ADD CONSTRAINT fk_quiz_questions_article_sentence_term
    FOREIGN KEY (article_sentence_term_id)
    REFERENCES article_sentence_terms(id)
    ON DELETE RESTRICT,
ADD CONSTRAINT ck_quiz_questions_admin_provenance CHECK (
    generation_source <> 'ADMIN'
    OR (
        quiz_id IS NOT NULL
        AND created_by_user_id IS NOT NULL
        AND updated_by_user_id IS NOT NULL
    )
);

CREATE INDEX idx_quiz_questions_sentence_term
ON quiz_questions (article_sentence_term_id);
CREATE INDEX idx_quiz_questions_cached
ON quiz_questions (
    article_sentence_term_id,
    generation_source,
    difficulty_cefr,
    question_type
)
WHERE quiz_id IS NULL AND is_active = TRUE;

ALTER TABLE review_sessions ADD COLUMN collection_id UUID;
ALTER TABLE review_sessions
ADD CONSTRAINT fk_review_sessions_collection
    FOREIGN KEY (collection_id)
    REFERENCES vocabulary_collections(id)
    ON DELETE RESTRICT;
ALTER TABLE review_sessions
DROP CONSTRAINT ck_review_sessions_quiz_requirement;
ALTER TABLE review_sessions
ADD CONSTRAINT ck_review_sessions_scope_requirement CHECK (
    (session_type = 'QUIZ' AND quiz_id IS NOT NULL
        AND article_id IS NOT NULL AND collection_id IS NULL)
    OR (session_type = 'DAILY_REVIEW' AND quiz_id IS NULL
        AND article_id IS NULL AND collection_id IS NULL)
    OR (session_type = 'ARTICLE_REVIEW' AND quiz_id IS NULL
        AND article_id IS NOT NULL AND collection_id IS NULL)
    OR (session_type = 'COLLECTION_REVIEW' AND quiz_id IS NULL
        AND article_id IS NULL AND collection_id IS NOT NULL)
);

CREATE INDEX idx_review_sessions_collection
ON review_sessions (collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX idx_review_sessions_active
ON review_sessions (user_id, status, session_type)
WHERE status = 'IN_PROGRESS';
CREATE UNIQUE INDEX uq_review_sessions_active_daily
ON review_sessions (user_id)
WHERE status = 'IN_PROGRESS' AND session_type = 'DAILY_REVIEW';
CREATE UNIQUE INDEX uq_review_sessions_active_quiz
ON review_sessions (user_id, quiz_id)
WHERE status = 'IN_PROGRESS' AND session_type = 'QUIZ';
CREATE UNIQUE INDEX uq_review_sessions_active_article
ON review_sessions (user_id, article_id)
WHERE status = 'IN_PROGRESS' AND session_type = 'ARTICLE_REVIEW';
CREATE UNIQUE INDEX uq_review_sessions_active_collection
ON review_sessions (user_id, collection_id)
WHERE status = 'IN_PROGRESS' AND session_type = 'COLLECTION_REVIEW';

CREATE TABLE review_session_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id       UUID NOT NULL,
    user_vocabulary_id      UUID,
    quiz_question_id        UUID NOT NULL,
    sequence_number         INTEGER NOT NULL,
    status                  review_session_item_status NOT NULL DEFAULT 'PENDING',
    retry_count             SMALLINT NOT NULL DEFAULT 0,
    final_inferred_score    SMALLINT,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_review_session_items_sequence
        UNIQUE (review_session_id, sequence_number),
    CONSTRAINT uq_review_session_items_question
        UNIQUE (review_session_id, quiz_question_id),
    CONSTRAINT fk_review_session_items_session
        FOREIGN KEY (review_session_id) REFERENCES review_sessions(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_review_session_items_user_vocabulary
        FOREIGN KEY (user_vocabulary_id) REFERENCES user_vocabularies(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_review_session_items_quiz_question
        FOREIGN KEY (quiz_question_id) REFERENCES quiz_questions(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_review_session_items_sequence_positive
        CHECK (sequence_number > 0),
    CONSTRAINT ck_review_session_items_retry_count_non_negative
        CHECK (retry_count >= 0),
    CONSTRAINT ck_review_session_items_final_inferred_score
        CHECK (final_inferred_score IS NULL OR final_inferred_score BETWEEN 0 AND 5),
    CONSTRAINT ck_review_session_items_status_time CHECK (
        (status = 'PENDING' AND completed_at IS NULL)
        OR (status IN ('COMPLETED', 'SKIPPED') AND completed_at IS NOT NULL)
    )
);

INSERT INTO review_session_items (
    review_session_id,
    user_vocabulary_id,
    quiz_question_id,
    sequence_number,
    status,
    retry_count,
    final_inferred_score,
    completed_at,
    created_at,
    updated_at
)
SELECT
    session.id,
    COALESCE(answer.user_vocabulary_id, vocabulary.id),
    question.id,
    question.display_order,
    CASE
        WHEN answer.id IS NOT NULL THEN 'COMPLETED'::review_session_item_status
        WHEN session.status = 'ABANDONED' THEN 'SKIPPED'::review_session_item_status
        ELSE 'PENDING'::review_session_item_status
    END,
    GREATEST(COALESCE(answer.attempt_number, 1) - 1, 0)::SMALLINT,
    CASE
        WHEN answer.is_correct = TRUE THEN 5::SMALLINT
        WHEN answer.is_correct = FALSE THEN 0::SMALLINT
        ELSE NULL
    END,
    CASE
        WHEN answer.id IS NOT NULL THEN answer.answered_at
        WHEN session.status = 'ABANDONED' THEN session.updated_at
        ELSE NULL
    END,
    session.created_at,
    NOW()
FROM review_sessions AS session
JOIN quiz_questions AS question ON question.quiz_id = session.quiz_id
LEFT JOIN LATERAL (
    SELECT legacy_answer.*
    FROM review_answers AS legacy_answer
    WHERE legacy_answer.review_session_id = session.id
      AND legacy_answer.quiz_question_id = question.id
    ORDER BY legacy_answer.attempt_number DESC,
      legacy_answer.answered_at DESC,
      legacy_answer.id ASC
    LIMIT 1
) AS answer ON TRUE
LEFT JOIN user_vocabularies AS vocabulary
  ON vocabulary.user_id = session.user_id
  AND vocabulary.article_sentence_term_id = question.article_vocabulary_id
WHERE question.is_active = TRUE OR answer.id IS NOT NULL;

CREATE INDEX idx_review_session_items_active
ON review_session_items (review_session_id, status, sequence_number)
WHERE status = 'PENDING';
CREATE INDEX idx_review_session_items_vocabulary_history
ON review_session_items (user_vocabulary_id, created_at DESC)
WHERE user_vocabulary_id IS NOT NULL;

CREATE TRIGGER trg_review_session_items_set_updated_at
BEFORE UPDATE ON review_session_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE review_answers
ADD COLUMN review_session_item_id UUID,
ADD COLUMN hints_used SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN inferred_review_score SMALLINT;

UPDATE review_answers AS answer
SET review_session_item_id = item.id,
    inferred_review_score = CASE
        WHEN answer.is_correct = TRUE THEN 5::SMALLINT
        WHEN answer.is_correct = FALSE THEN 0::SMALLINT
        ELSE NULL
    END
FROM review_session_items AS item
WHERE item.review_session_id = answer.review_session_id
  AND item.quiz_question_id = answer.quiz_question_id;

ALTER TABLE review_answers
ALTER COLUMN review_session_item_id SET NOT NULL,
ADD CONSTRAINT fk_review_answers_session_item
    FOREIGN KEY (review_session_item_id) REFERENCES review_session_items(id)
    ON DELETE RESTRICT,
ADD CONSTRAINT ck_review_answers_hints_used_non_negative
    CHECK (hints_used >= 0),
ADD CONSTRAINT ck_review_answers_inferred_review_score
    CHECK (inferred_review_score IS NULL OR inferred_review_score BETWEEN 0 AND 5);

DROP INDEX idx_quiz_questions_vocabulary;
ALTER TABLE quiz_questions
DROP CONSTRAINT fk_quiz_questions_article_vocabulary,
DROP COLUMN article_vocabulary_id;

DROP INDEX idx_review_answers_session_answered;
DROP INDEX idx_review_answers_vocabulary_answered;
DROP INDEX idx_review_answers_user_vocabulary;
DROP INDEX idx_review_answers_quiz_dashboard;

ALTER TABLE review_answers
DROP CONSTRAINT ck_review_answers_item_shape,
DROP CONSTRAINT fk_review_answers_session,
DROP CONSTRAINT fk_review_answers_article_vocabulary,
DROP CONSTRAINT fk_review_answers_user_vocabulary,
DROP COLUMN review_session_id,
DROP COLUMN article_vocabulary_id,
DROP COLUMN user_vocabulary_id,
DROP COLUMN item_type,
ALTER COLUMN quiz_question_id SET NOT NULL;

DROP TYPE review_item_type;

ALTER TABLE review_answers
ADD CONSTRAINT ck_review_answers_item_shape CHECK (
    is_correct IS NOT NULL
    AND (
        selected_option_id IS NOT NULL
        OR (user_answer_text IS NOT NULL AND btrim(user_answer_text) <> '')
    )
);
CREATE INDEX idx_review_answers_item_history
ON review_answers (review_session_item_id, answered_at DESC);
CREATE UNIQUE INDEX uq_review_answers_item_attempt
ON review_answers (review_session_item_id, attempt_number);
CREATE INDEX idx_review_answers_quiz_question
ON review_answers (quiz_question_id);

ALTER TABLE question_options
ADD COLUMN generation_source question_generation_source NOT NULL DEFAULT 'ADMIN';
UPDATE question_options AS option
SET generation_source = question.generation_source
FROM quiz_questions AS question
WHERE question.id = option.quiz_question_id;

CREATE UNIQUE INDEX uq_quiz_questions_ai_cache
ON quiz_questions (
    article_sentence_term_id,
    difficulty_cefr,
    question_type
)
WHERE quiz_id IS NULL
  AND is_active = TRUE
  AND generation_source = 'AI';

COMMIT;

-- ============================================================================
-- CROSS-TABLE BUSINESS RULES TO ENFORCE IN THE APPLICATION SERVICE
-- ============================================================================
--
-- 1. Non-null created_by_user_id / updated_by_user_id values must belong to an
--    ADMIN account. Cached generated questions intentionally keep both null.
--
-- 2. quiz_questions.article_sentence_term_id references article_sentence_terms.id
--    and its sentence must belong to the same article as quizzes.article_id.
--
-- 3. articles.content_html is the render-ready HTML source. During parsing, the
--    backend wraps each sentence with data-sentence-id equal to article_sentences.id.
--    article_sentences.sentence_order is used only for ordered admin management and
--    must match the current content_version.
--
-- 4. When an admin adds or updates a term, the backend verifies that value exists
--    inside the selected sentence, then rebuilds the sentence HTML and wraps every
--    matching occurrence with data-term-id equal to article_sentence_terms.id. The
--    frontend renders articles.content_html directly and handles clicks through
--    event delegation on data-term-id. CEFR only controls highlight styling; it does
--    not identify the term position. No character offsets are persisted. A saved or
--    mastered state applies to that exact sentence-scoped term cache.
--
-- 5. A multiple-choice question must have at least two options and exactly
--    one correct option before it can be published or cached for review.
--
-- 6. selected_option_id must belong to review_answers.quiz_question_id.
--
-- 7. review_answers.quiz_question_id must match the question assigned to its
--    review_session_item at the time that answer attempt is submitted.
--
-- 8. review_session_items.user_vocabulary_id, when present, must belong to the
--    same user as the parent review session and reference the same contextual
--    term as review_session_items.quiz_question_id.
--
-- 9. vocabulary_collection_items must connect a collection and a saved word
--    owned by the same user. This ownership rule is validated in the service.
--
-- 10. Published or user-referenced content should be archived/deactivated
--     instead of hard deleted.
--
-- 11. Dashboard totals should be calculated from source tables rather than
--     stored in a separate user_progress table during the MVP.
--
-- 12. AI question generation runs only before a generated review session is
--     materialized. Successful questions and options are cached with AI
--     provenance; answer submission never invokes an AI provider.
