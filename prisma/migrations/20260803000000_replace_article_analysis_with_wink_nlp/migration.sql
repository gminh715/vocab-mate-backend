-- Locally extracted WinkNLP terms begin with only their sentence association,
-- exact surface value and lemma. Lookup-time enrichment fills these fields.
ALTER TABLE "article_sentence_terms"
ALTER COLUMN "word_display" DROP NOT NULL,
ALTER COLUMN "normalized_lemma" DROP NOT NULL,
ALTER COLUMN "part_of_speech" DROP NOT NULL,
ALTER COLUMN "cefr_level" DROP NOT NULL;

ALTER TYPE "term_origin" ADD VALUE 'NLP';

