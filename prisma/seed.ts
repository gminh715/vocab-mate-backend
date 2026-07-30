import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ─── Pre-generated UUIDs ──────────────────────────────────────────────
// Using deterministic UUIDs so that FK references, data-sentence-id and
// data-term-id markers in contentHtml stay consistent.

const ADMIN_USER_ID = 'a0000000-0000-4000-8000-000000000001';

const CATEGORY_IDS = {
  technology: 'c0000000-0000-4000-8000-000000000001',
  science: 'c0000000-0000-4000-8000-000000000002',
  health: 'c0000000-0000-4000-8000-000000000003',
  business: 'c0000000-0000-4000-8000-000000000004',
  environment: 'c0000000-0000-4000-8000-000000000005',
};

// Article IDs
const ART = {
  ai: 'b0000000-0000-4000-8000-000000000001',
  mars: 'b0000000-0000-4000-8000-000000000002',
  sleep: 'b0000000-0000-4000-8000-000000000003',
  remote: 'b0000000-0000-4000-8000-000000000004',
  ocean: 'b0000000-0000-4000-8000-000000000005',
};

// Sentence IDs (5 per article = 25 total)
const SEN = {
  ai: [
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000004',
    'd1000000-0000-4000-8000-000000000005',
  ],
  mars: [
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000003',
    'd2000000-0000-4000-8000-000000000004',
    'd2000000-0000-4000-8000-000000000005',
  ],
  sleep: [
    'd3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000002',
    'd3000000-0000-4000-8000-000000000003',
    'd3000000-0000-4000-8000-000000000004',
    'd3000000-0000-4000-8000-000000000005',
  ],
  remote: [
    'd4000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000003',
    'd4000000-0000-4000-8000-000000000004',
    'd4000000-0000-4000-8000-000000000005',
  ],
  ocean: [
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000003',
    'd5000000-0000-4000-8000-000000000004',
    'd5000000-0000-4000-8000-000000000005',
  ],
};

// Term IDs (3 per sentence × 5 sentences × 5 articles = 75 total)
// Pattern: t<article><sentence><term>
const TRM = {
  ai: [
    // sentence 0
    [
      'e1100000-0000-4000-8000-000000000001',
      'e1100000-0000-4000-8000-000000000002',
      'e1100000-0000-4000-8000-000000000003',
    ],
    // sentence 1
    [
      'e1200000-0000-4000-8000-000000000001',
      'e1200000-0000-4000-8000-000000000002',
      'e1200000-0000-4000-8000-000000000003',
    ],
    // sentence 2
    [
      'e1300000-0000-4000-8000-000000000001',
      'e1300000-0000-4000-8000-000000000002',
      'e1300000-0000-4000-8000-000000000003',
    ],
    // sentence 3
    [
      'e1400000-0000-4000-8000-000000000001',
      'e1400000-0000-4000-8000-000000000002',
      'e1400000-0000-4000-8000-000000000003',
    ],
    // sentence 4
    [
      'e1500000-0000-4000-8000-000000000001',
      'e1500000-0000-4000-8000-000000000002',
      'e1500000-0000-4000-8000-000000000003',
    ],
  ],
  mars: [
    [
      'e2100000-0000-4000-8000-000000000001',
      'e2100000-0000-4000-8000-000000000002',
      'e2100000-0000-4000-8000-000000000003',
    ],
    [
      'e2200000-0000-4000-8000-000000000001',
      'e2200000-0000-4000-8000-000000000002',
      'e2200000-0000-4000-8000-000000000003',
    ],
    [
      'e2300000-0000-4000-8000-000000000001',
      'e2300000-0000-4000-8000-000000000002',
      'e2300000-0000-4000-8000-000000000003',
    ],
    [
      'e2400000-0000-4000-8000-000000000001',
      'e2400000-0000-4000-8000-000000000002',
      'e2400000-0000-4000-8000-000000000003',
    ],
    [
      'e2500000-0000-4000-8000-000000000001',
      'e2500000-0000-4000-8000-000000000002',
      'e2500000-0000-4000-8000-000000000003',
    ],
  ],
  sleep: [
    [
      'e3100000-0000-4000-8000-000000000001',
      'e3100000-0000-4000-8000-000000000002',
      'e3100000-0000-4000-8000-000000000003',
    ],
    [
      'e3200000-0000-4000-8000-000000000001',
      'e3200000-0000-4000-8000-000000000002',
      'e3200000-0000-4000-8000-000000000003',
    ],
    [
      'e3300000-0000-4000-8000-000000000001',
      'e3300000-0000-4000-8000-000000000002',
      'e3300000-0000-4000-8000-000000000003',
    ],
    [
      'e3400000-0000-4000-8000-000000000001',
      'e3400000-0000-4000-8000-000000000002',
      'e3400000-0000-4000-8000-000000000003',
    ],
    [
      'e3500000-0000-4000-8000-000000000001',
      'e3500000-0000-4000-8000-000000000002',
      'e3500000-0000-4000-8000-000000000003',
    ],
  ],
  remote: [
    [
      'e4100000-0000-4000-8000-000000000001',
      'e4100000-0000-4000-8000-000000000002',
      'e4100000-0000-4000-8000-000000000003',
    ],
    [
      'e4200000-0000-4000-8000-000000000001',
      'e4200000-0000-4000-8000-000000000002',
      'e4200000-0000-4000-8000-000000000003',
    ],
    [
      'e4300000-0000-4000-8000-000000000001',
      'e4300000-0000-4000-8000-000000000002',
      'e4300000-0000-4000-8000-000000000003',
    ],
    [
      'e4400000-0000-4000-8000-000000000001',
      'e4400000-0000-4000-8000-000000000002',
      'e4400000-0000-4000-8000-000000000003',
    ],
    [
      'e4500000-0000-4000-8000-000000000001',
      'e4500000-0000-4000-8000-000000000002',
      'e4500000-0000-4000-8000-000000000003',
    ],
  ],
  ocean: [
    [
      'e5100000-0000-4000-8000-000000000001',
      'e5100000-0000-4000-8000-000000000002',
      'e5100000-0000-4000-8000-000000000003',
    ],
    [
      'e5200000-0000-4000-8000-000000000001',
      'e5200000-0000-4000-8000-000000000002',
      'e5200000-0000-4000-8000-000000000003',
    ],
    [
      'e5300000-0000-4000-8000-000000000001',
      'e5300000-0000-4000-8000-000000000002',
      'e5300000-0000-4000-8000-000000000003',
    ],
    [
      'e5400000-0000-4000-8000-000000000001',
      'e5400000-0000-4000-8000-000000000002',
      'e5400000-0000-4000-8000-000000000003',
    ],
    [
      'e5500000-0000-4000-8000-000000000001',
      'e5500000-0000-4000-8000-000000000002',
      'e5500000-0000-4000-8000-000000000003',
    ],
  ],
};

// ─── Helper to build contentHtml with data-sentence-id + data-term-id markers ─
function buildContentHtml(
  sentenceIds: string[],
  termIds: string[][],
  sentences: { text: string; termTexts: string[] }[],
): string {
  return sentences
    .map((s, si) => {
      let annotated = s.text;
      // Wrap each term occurrence in the sentence text with a data-term-id span
      s.termTexts.forEach((termText, ti) => {
        annotated = annotated.replace(
          termText,
          `<span data-term-id="${termIds[si][ti]}">${termText}</span>`,
        );
      });
      return `<p><span data-sentence-id="${sentenceIds[si]}">${annotated}</span></p>`;
    })
    .join('\n');
}

// ─── Article data ─────────────────────────────────────────────────────

interface SentenceData {
  text: string;
  translationVi: string;
  explanationVi: string;
  termTexts: string[];
}

interface TermData {
  value: string;
  wordDisplay: string;
  lemma: string;
  normalizedLemma: string;
  unitType: 'WORD' | 'PHRASE';
  partOfSpeech: string;
  ipa: string;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  contextualMeaningVi: string;
  definitionEn: string;
  contextualExplanation: string;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  relatedTerms: string[];
  vocabularyTopic: string;
  examples: { en: string; vi: string }[];
}

// ──────────────────────────────────────────────────────────────────────
// Article 1: AI in Education (Technology, B1)
// ──────────────────────────────────────────────────────────────────────
const aiSentences: SentenceData[] = [
  {
    text: 'Artificial intelligence is rapidly transforming the way students learn in classrooms around the world.',
    translationVi:
      'Trí tuệ nhân tạo đang nhanh chóng thay đổi cách học sinh học tập trong các lớp học trên toàn thế giới.',
    explanationVi:
      'Câu này giới thiệu chủ đề chính: AI đang thay đổi giáo dục trên phạm vi toàn cầu.',
    termTexts: ['Artificial intelligence', 'transforming', 'classrooms'],
  },
  {
    text: 'Teachers are using adaptive software that personalizes lessons based on each student\'s strengths and weaknesses.',
    translationVi:
      'Giáo viên đang sử dụng phần mềm thích ứng giúp cá nhân hóa bài học dựa trên điểm mạnh và điểm yếu của từng học sinh.',
    explanationVi:
      'Phần mềm thích ứng tự điều chỉnh nội dung phù hợp với năng lực từng người học.',
    termTexts: ['adaptive', 'personalizes', 'weaknesses'],
  },
  {
    text: 'Some educators worry that an over-reliance on technology could undermine critical thinking skills.',
    translationVi:
      'Một số nhà giáo dục lo ngại rằng việc phụ thuộc quá nhiều vào công nghệ có thể làm suy yếu kỹ năng tư duy phản biện.',
    explanationVi:
      'Đây là quan điểm phản biện: công nghệ có thể gây hại nếu lạm dụng.',
    termTexts: ['over-reliance', 'undermine', 'critical thinking'],
  },
  {
    text: 'Research suggests that blended learning, which combines digital tools with face-to-face instruction, yields the best outcomes.',
    translationVi:
      'Nghiên cứu cho thấy học tập kết hợp, kết hợp công cụ kỹ thuật số với giảng dạy trực tiếp, mang lại kết quả tốt nhất.',
    explanationVi:
      'Blended learning được coi là phương pháp hiệu quả nhất theo nghiên cứu.',
    termTexts: ['blended learning', 'face-to-face', 'yields'],
  },
  {
    text: 'As AI continues to evolve, schools must develop clear guidelines to ensure ethical and equitable use of these tools.',
    translationVi:
      'Khi AI tiếp tục phát triển, các trường học phải xây dựng hướng dẫn rõ ràng để đảm bảo sử dụng công cụ một cách đạo đức và công bằng.',
    explanationVi:
      'Câu kết luận nhấn mạnh tầm quan trọng của chính sách đạo đức trong việc ứng dụng AI.',
    termTexts: ['evolve', 'guidelines', 'equitable'],
  },
];

const aiTerms: TermData[][] = [
  // Sentence 0
  [
    {
      value: 'Artificial intelligence',
      wordDisplay: 'Artificial intelligence',
      lemma: 'artificial intelligence',
      normalizedLemma: 'artificial intelligence',
      unitType: 'PHRASE',
      partOfSpeech: 'noun',
      ipa: '/ˌɑːr.tɪˈfɪʃ.əl ɪnˈtel.ɪ.dʒəns/',
      cefrLevel: 'B1',
      contextualMeaningVi: 'trí tuệ nhân tạo',
      definitionEn:
        'The simulation of human intelligence by computer systems.',
      contextualExplanation:
        'Here it refers to AI technology being applied in educational settings.',
      synonyms: ['AI', 'machine intelligence'],
      antonyms: ['human intelligence'],
      collocations: ['artificial intelligence system', 'artificial intelligence research'],
      relatedTerms: ['machine learning', 'deep learning', 'neural network'],
      vocabularyTopic: 'Technology',
      examples: [
        { en: 'Artificial intelligence can analyze student performance data.', vi: 'Trí tuệ nhân tạo có thể phân tích dữ liệu hiệu suất của học sinh.' },
        { en: 'Many companies invest heavily in artificial intelligence.', vi: 'Nhiều công ty đầu tư mạnh vào trí tuệ nhân tạo.' },
      ],
    },
    {
      value: 'transforming',
      wordDisplay: 'transforming',
      lemma: 'transform',
      normalizedLemma: 'transform',
      unitType: 'WORD',
      partOfSpeech: 'verb',
      ipa: '/trænsˈfɔːrmɪŋ/',
      cefrLevel: 'B1',
      contextualMeaningVi: 'thay đổi hoàn toàn',
      definitionEn: 'To change completely in form, appearance, or character.',
      contextualExplanation:
        'Used here to show AI is fundamentally changing education, not just making small improvements.',
      synonyms: ['revolutionizing', 'reshaping'],
      antonyms: ['preserving', 'maintaining'],
      collocations: ['transforming education', 'transforming the industry'],
      relatedTerms: ['transformation', 'change', 'reform'],
      vocabularyTopic: 'Change & Development',
      examples: [
        { en: 'Technology is transforming healthcare delivery.', vi: 'Công nghệ đang thay đổi hoàn toàn việc cung cấp dịch vụ y tế.' },
        { en: 'The internet has transformed how we communicate.', vi: 'Internet đã thay đổi hoàn toàn cách chúng ta giao tiếp.' },
      ],
    },
    {
      value: 'classrooms',
      wordDisplay: 'classrooms',
      lemma: 'classroom',
      normalizedLemma: 'classroom',
      unitType: 'WORD',
      partOfSpeech: 'noun',
      ipa: '/ˈklæs.ruːmz/',
      cefrLevel: 'A2',
      contextualMeaningVi: 'các lớp học',
      definitionEn: 'Rooms in which classes are held in a school or college.',
      contextualExplanation:
        'Refers to physical and virtual learning spaces where AI is being applied.',
      synonyms: ['lecture halls', 'learning spaces'],
      antonyms: [],
      collocations: ['in the classroom', 'classroom environment'],
      relatedTerms: ['school', 'education', 'learning'],
      vocabularyTopic: 'Education',
      examples: [
        { en: 'Modern classrooms are equipped with interactive whiteboards.', vi: 'Các lớp học hiện đại được trang bị bảng trắng tương tác.' },
        { en: 'The classroom was silent during the exam.', vi: 'Lớp học im lặng trong suốt kỳ thi.' },
      ],
    },
  ],
  // Sentence 1
  [
    {
      value: 'adaptive',
      wordDisplay: 'adaptive',
      lemma: 'adaptive',
      normalizedLemma: 'adaptive',
      unitType: 'WORD',
      partOfSpeech: 'adjective',
      ipa: '/əˈdæp.tɪv/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'thích ứng',
      definitionEn: 'Having the ability to change to suit different conditions.',
      contextualExplanation:
        'Describes software that adjusts its content based on learner performance.',
      synonyms: ['flexible', 'adjustable'],
      antonyms: ['rigid', 'fixed'],
      collocations: ['adaptive learning', 'adaptive technology'],
      relatedTerms: ['adapt', 'adaptation', 'responsive'],
      vocabularyTopic: 'Technology',
      examples: [
        { en: 'Adaptive learning platforms adjust difficulty in real time.', vi: 'Nền tảng học thích ứng điều chỉnh độ khó theo thời gian thực.' },
        { en: 'The adaptive algorithm improved user engagement.', vi: 'Thuật toán thích ứng cải thiện sự tương tác của người dùng.' },
      ],
    },
    {
      value: 'personalizes',
      wordDisplay: 'personalizes',
      lemma: 'personalize',
      normalizedLemma: 'personalize',
      unitType: 'WORD',
      partOfSpeech: 'verb',
      ipa: '/ˈpɜːr.sən.əl.aɪzɪz/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'cá nhân hóa',
      definitionEn: 'To design or tailor something to meet individual needs.',
      contextualExplanation:
        'The software creates unique learning paths for each student.',
      synonyms: ['customizes', 'tailors'],
      antonyms: ['standardizes', 'generalizes'],
      collocations: ['personalize content', 'personalize the experience'],
      relatedTerms: ['personalization', 'individual', 'custom'],
      vocabularyTopic: 'Technology',
      examples: [
        { en: 'The app personalizes recommendations based on your history.', vi: 'Ứng dụng cá nhân hóa đề xuất dựa trên lịch sử của bạn.' },
        { en: 'Schools aim to personalize education for every child.', vi: 'Các trường học hướng tới cá nhân hóa giáo dục cho mỗi trẻ.' },
      ],
    },
    {
      value: 'weaknesses',
      wordDisplay: 'weaknesses',
      lemma: 'weakness',
      normalizedLemma: 'weakness',
      unitType: 'WORD',
      partOfSpeech: 'noun',
      ipa: '/ˈwiːk.nəs.ɪz/',
      cefrLevel: 'B1',
      contextualMeaningVi: 'điểm yếu',
      definitionEn: 'Areas in which someone or something lacks strength or ability.',
      contextualExplanation:
        'Refers to academic areas where a student needs improvement.',
      synonyms: ['shortcomings', 'deficiencies'],
      antonyms: ['strengths', 'advantages'],
      collocations: ['strengths and weaknesses', 'identify weaknesses'],
      relatedTerms: ['weak', 'vulnerability', 'limitation'],
      vocabularyTopic: 'Personal Development',
      examples: [
        { en: 'The test revealed her weaknesses in grammar.', vi: 'Bài kiểm tra cho thấy điểm yếu của cô ấy về ngữ pháp.' },
        { en: 'Knowing your weaknesses is the first step to improvement.', vi: 'Biết điểm yếu của bạn là bước đầu tiên để cải thiện.' },
      ],
    },
  ],
  // Sentence 2
  [
    {
      value: 'over-reliance',
      wordDisplay: 'over-reliance',
      lemma: 'over-reliance',
      normalizedLemma: 'over-reliance',
      unitType: 'WORD',
      partOfSpeech: 'noun',
      ipa: '/ˌoʊ.vɚ.rɪˈlaɪ.əns/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'sự phụ thuộc quá mức',
      definitionEn: 'Excessive dependence on something.',
      contextualExplanation:
        'Warns against depending too heavily on AI in the classroom.',
      synonyms: ['excessive dependence', 'overdependence'],
      antonyms: ['independence', 'self-reliance'],
      collocations: ['over-reliance on technology', 'over-reliance on data'],
      relatedTerms: ['reliance', 'dependence', 'dependency'],
      vocabularyTopic: 'Critical Thinking',
      examples: [
        { en: 'Over-reliance on GPS can reduce navigational skills.', vi: 'Phụ thuộc quá mức vào GPS có thể làm giảm kỹ năng định hướng.' },
        { en: 'The report warned against over-reliance on a single supplier.', vi: 'Báo cáo cảnh báo về sự phụ thuộc quá mức vào một nhà cung cấp duy nhất.' },
      ],
    },
    {
      value: 'undermine',
      wordDisplay: 'undermine',
      lemma: 'undermine',
      normalizedLemma: 'undermine',
      unitType: 'WORD',
      partOfSpeech: 'verb',
      ipa: '/ˌʌn.dɚˈmaɪn/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'làm suy yếu',
      definitionEn: 'To gradually weaken or damage something.',
      contextualExplanation:
        'Suggests that too much technology may weaken students\' ability to think independently.',
      synonyms: ['weaken', 'erode'],
      antonyms: ['strengthen', 'reinforce'],
      collocations: ['undermine confidence', 'undermine authority'],
      relatedTerms: ['sabotage', 'destabilize', 'compromise'],
      vocabularyTopic: 'Critical Thinking',
      examples: [
        { en: 'Constant criticism can undermine a child\'s self-esteem.', vi: 'Chỉ trích liên tục có thể làm suy yếu lòng tự trọng của trẻ.' },
        { en: 'The scandal undermined public trust in the institution.', vi: 'Vụ bê bối đã làm suy yếu niềm tin của công chúng vào tổ chức.' },
      ],
    },
    {
      value: 'critical thinking',
      wordDisplay: 'critical thinking',
      lemma: 'critical thinking',
      normalizedLemma: 'critical thinking',
      unitType: 'PHRASE',
      partOfSpeech: 'noun',
      ipa: '/ˈkrɪt.ɪ.kəl ˈθɪŋ.kɪŋ/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'tư duy phản biện',
      definitionEn:
        'The objective analysis and evaluation of an issue to form a judgment.',
      contextualExplanation:
        'An essential skill that may be weakened if students rely too much on AI for answers.',
      synonyms: ['analytical thinking', 'logical reasoning'],
      antonyms: [],
      collocations: ['critical thinking skills', 'develop critical thinking'],
      relatedTerms: ['problem solving', 'reasoning', 'analysis'],
      vocabularyTopic: 'Education',
      examples: [
        { en: 'Universities aim to develop students\' critical thinking.', vi: 'Các trường đại học hướng tới phát triển tư duy phản biện của sinh viên.' },
        { en: 'Critical thinking helps people evaluate information objectively.', vi: 'Tư duy phản biện giúp mọi người đánh giá thông tin một cách khách quan.' },
      ],
    },
  ],
  // Sentence 3
  [
    {
      value: 'blended learning',
      wordDisplay: 'blended learning',
      lemma: 'blended learning',
      normalizedLemma: 'blended learning',
      unitType: 'PHRASE',
      partOfSpeech: 'noun',
      ipa: '/ˈblɛn.dɪd ˈlɜːr.nɪŋ/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'học tập kết hợp',
      definitionEn:
        'An educational approach that combines online digital media with traditional face-to-face classroom methods.',
      contextualExplanation:
        'Presented as the most effective approach according to research.',
      synonyms: ['hybrid learning', 'mixed-mode learning'],
      antonyms: ['purely online learning', 'fully traditional learning'],
      collocations: ['blended learning model', 'blended learning environment'],
      relatedTerms: ['e-learning', 'distance learning', 'flipped classroom'],
      vocabularyTopic: 'Education',
      examples: [
        { en: 'Blended learning became popular during the pandemic.', vi: 'Học tập kết hợp trở nên phổ biến trong đại dịch.' },
        { en: 'The school adopted a blended learning approach last year.', vi: 'Trường đã áp dụng phương pháp học tập kết hợp vào năm ngoái.' },
      ],
    },
    {
      value: 'face-to-face',
      wordDisplay: 'face-to-face',
      lemma: 'face-to-face',
      normalizedLemma: 'face-to-face',
      unitType: 'PHRASE',
      partOfSpeech: 'adjective',
      ipa: '/ˌfeɪs.tə.ˈfeɪs/',
      cefrLevel: 'B1',
      contextualMeaningVi: 'trực tiếp (mặt đối mặt)',
      definitionEn: 'Involving direct personal contact and interaction.',
      contextualExplanation:
        'Contrasted with digital tools; refers to in-person teaching.',
      synonyms: ['in-person', 'direct'],
      antonyms: ['online', 'remote', 'virtual'],
      collocations: ['face-to-face meeting', 'face-to-face interaction'],
      relatedTerms: ['in-person', 'on-site', 'physical'],
      vocabularyTopic: 'Communication',
      examples: [
        { en: 'Face-to-face instruction allows immediate feedback.', vi: 'Giảng dạy trực tiếp cho phép phản hồi ngay lập tức.' },
        { en: 'Many employees prefer face-to-face meetings over video calls.', vi: 'Nhiều nhân viên thích cuộc họp trực tiếp hơn cuộc gọi video.' },
      ],
    },
    {
      value: 'yields',
      wordDisplay: 'yields',
      lemma: 'yield',
      normalizedLemma: 'yield',
      unitType: 'WORD',
      partOfSpeech: 'verb',
      ipa: '/jiːldz/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'mang lại (kết quả)',
      definitionEn: 'To produce or provide a result or outcome.',
      contextualExplanation:
        'Used to state that blended learning produces the best educational results.',
      synonyms: ['produces', 'generates'],
      antonyms: [],
      collocations: ['yields results', 'yields benefits'],
      relatedTerms: ['outcome', 'produce', 'result'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'The experiment yielded unexpected results.', vi: 'Thí nghiệm mang lại kết quả bất ngờ.' },
        { en: 'Careful planning yields better outcomes.', vi: 'Lập kế hoạch cẩn thận mang lại kết quả tốt hơn.' },
      ],
    },
  ],
  // Sentence 4
  [
    {
      value: 'evolve',
      wordDisplay: 'evolve',
      lemma: 'evolve',
      normalizedLemma: 'evolve',
      unitType: 'WORD',
      partOfSpeech: 'verb',
      ipa: '/ɪˈvɑːlv/',
      cefrLevel: 'B2',
      contextualMeaningVi: 'phát triển, tiến hóa',
      definitionEn: 'To develop gradually over time.',
      contextualExplanation:
        'Refers to the ongoing improvement and expansion of AI capabilities.',
      synonyms: ['develop', 'advance', 'progress'],
      antonyms: ['regress', 'stagnate'],
      collocations: ['continue to evolve', 'evolve rapidly'],
      relatedTerms: ['evolution', 'development', 'growth'],
      vocabularyTopic: 'Change & Development',
      examples: [
        { en: 'Languages evolve over centuries.', vi: 'Ngôn ngữ phát triển qua nhiều thế kỷ.' },
        { en: 'The company\'s strategy has evolved significantly.', vi: 'Chiến lược của công ty đã phát triển đáng kể.' },
      ],
    },
    {
      value: 'guidelines',
      wordDisplay: 'guidelines',
      lemma: 'guideline',
      normalizedLemma: 'guideline',
      unitType: 'WORD',
      partOfSpeech: 'noun',
      ipa: '/ˈɡaɪd.laɪnz/',
      cefrLevel: 'B1',
      contextualMeaningVi: 'hướng dẫn, quy tắc',
      definitionEn: 'General rules or principles that provide direction.',
      contextualExplanation:
        'Schools need policies to govern how AI is used responsibly.',
      synonyms: ['rules', 'principles', 'standards'],
      antonyms: [],
      collocations: ['follow guidelines', 'develop guidelines'],
      relatedTerms: ['policy', 'regulation', 'framework'],
      vocabularyTopic: 'Policy',
      examples: [
        { en: 'The government issued new health guidelines.', vi: 'Chính phủ ban hành hướng dẫn y tế mới.' },
        { en: 'Please read the safety guidelines before starting.', vi: 'Vui lòng đọc hướng dẫn an toàn trước khi bắt đầu.' },
      ],
    },
    {
      value: 'equitable',
      wordDisplay: 'equitable',
      lemma: 'equitable',
      normalizedLemma: 'equitable',
      unitType: 'WORD',
      partOfSpeech: 'adjective',
      ipa: '/ˈek.wɪ.tə.bəl/',
      cefrLevel: 'C1',
      contextualMeaningVi: 'công bằng',
      definitionEn: 'Fair and impartial; treating everyone equally.',
      contextualExplanation:
        'Emphasizes that AI tools should be accessible to all students, not just privileged ones.',
      synonyms: ['fair', 'just', 'impartial'],
      antonyms: ['unfair', 'biased', 'inequitable'],
      collocations: ['equitable access', 'equitable distribution'],
      relatedTerms: ['equity', 'equality', 'fairness'],
      vocabularyTopic: 'Social Issues',
      examples: [
        { en: 'The policy aims to ensure equitable access to education.', vi: 'Chính sách nhằm đảm bảo tiếp cận giáo dục công bằng.' },
        { en: 'An equitable solution benefits all parties.', vi: 'Giải pháp công bằng mang lại lợi ích cho tất cả các bên.' },
      ],
    },
  ],
];

// ──────────────────────────────────────────────────────────────────────
// Article 2: Mars Exploration (Science, B2)
// ──────────────────────────────────────────────────────────────────────
const marsSentences: SentenceData[] = [
  {
    text: 'NASA\'s Perseverance rover has discovered compelling evidence of ancient microbial life on Mars.',
    translationVi:
      'Xe tự hành Perseverance của NASA đã phát hiện bằng chứng thuyết phục về sự sống vi sinh vật cổ đại trên sao Hỏa.',
    explanationVi:
      'Câu mở đầu nêu phát hiện quan trọng nhất: bằng chứng về sự sống trên sao Hỏa.',
    termTexts: ['rover', 'compelling', 'microbial'],
  },
  {
    text: 'The samples, collected from the Jezero Crater, contain organic molecules that suggest biological processes once occurred.',
    translationVi:
      'Các mẫu thu thập từ miệng núi lửa Jezero chứa các phân tử hữu cơ cho thấy các quá trình sinh học đã từng xảy ra.',
    explanationVi:
      'Chi tiết về vị trí và loại bằng chứng: phân tử hữu cơ từ Jezero Crater.',
    termTexts: ['samples', 'organic molecules', 'biological'],
  },
  {
    text: 'Scientists caution that further analysis is necessary to rule out non-biological explanations for these findings.',
    translationVi:
      'Các nhà khoa học cảnh báo rằng cần phân tích thêm để loại trừ các giải thích phi sinh học cho những phát hiện này.',
    explanationVi:
      'Quan điểm thận trọng: cần nghiên cứu thêm trước khi kết luận.',
    termTexts: ['caution', 'rule out', 'findings'],
  },
  {
    text: 'The Mars Sample Return mission, a joint effort between NASA and ESA, aims to bring these specimens back to Earth by 2033.',
    translationVi:
      'Sứ mệnh Mars Sample Return, nỗ lực chung giữa NASA và ESA, nhằm mang các mẫu vật này trở lại Trái Đất vào năm 2033.',
    explanationVi:
      'Giới thiệu kế hoạch đưa mẫu về Trái Đất để phân tích chi tiết hơn.',
    termTexts: ['joint effort', 'specimens', 'mission'],
  },
  {
    text: 'If confirmed, this discovery would fundamentally alter our understanding of life in the universe.',
    translationVi:
      'Nếu được xác nhận, khám phá này sẽ thay đổi căn bản hiểu biết của chúng ta về sự sống trong vũ trụ.',
    explanationVi:
      'Câu kết nhấn mạnh tầm quan trọng to lớn của phát hiện nếu được xác thực.',
    termTexts: ['confirmed', 'fundamentally', 'alter'],
  },
];

const marsTerms: TermData[][] = [
  [
    {
      value: 'rover', wordDisplay: 'rover', lemma: 'rover', normalizedLemma: 'rover',
      unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈroʊ.vɚ/', cefrLevel: 'B2',
      contextualMeaningVi: 'xe tự hành thám hiểm',
      definitionEn: 'A vehicle designed to travel over rough terrain on a planet.',
      contextualExplanation: 'Refers to Perseverance, the robotic vehicle exploring Mars.',
      synonyms: ['exploration vehicle'], antonyms: [],
      collocations: ['Mars rover', 'lunar rover'], relatedTerms: ['spacecraft', 'probe', 'lander'],
      vocabularyTopic: 'Space Exploration',
      examples: [
        { en: 'The rover transmitted high-resolution images of the Martian surface.', vi: 'Xe tự hành truyền hình ảnh độ phân giải cao về bề mặt sao Hỏa.' },
        { en: 'Engineers designed the rover to withstand extreme temperatures.', vi: 'Các kỹ sư thiết kế xe tự hành để chịu được nhiệt độ khắc nghiệt.' },
      ],
    },
    {
      value: 'compelling', wordDisplay: 'compelling', lemma: 'compelling', normalizedLemma: 'compelling',
      unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/kəmˈpɛl.ɪŋ/', cefrLevel: 'B2',
      contextualMeaningVi: 'thuyết phục, hấp dẫn',
      definitionEn: 'Evoking interest or attention in a powerful way; convincing.',
      contextualExplanation: 'Describes the strength of the evidence found on Mars.',
      synonyms: ['convincing', 'persuasive'], antonyms: ['unconvincing', 'weak'],
      collocations: ['compelling evidence', 'compelling argument'], relatedTerms: ['persuasive', 'conclusive'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'The lawyer presented a compelling case to the jury.', vi: 'Luật sư trình bày một vụ việc thuyết phục trước bồi thẩm đoàn.' },
        { en: 'Her story was so compelling that everyone listened in silence.', vi: 'Câu chuyện của cô ấy hấp dẫn đến mức mọi người im lặng lắng nghe.' },
      ],
    },
    {
      value: 'microbial', wordDisplay: 'microbial', lemma: 'microbial', normalizedLemma: 'microbial',
      unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/maɪˈkroʊ.bi.əl/', cefrLevel: 'C1',
      contextualMeaningVi: 'thuộc vi sinh vật',
      definitionEn: 'Relating to or caused by microorganisms.',
      contextualExplanation: 'Describes the type of ancient life potentially found on Mars — microscopic organisms.',
      synonyms: ['bacterial', 'microscopic'], antonyms: [],
      collocations: ['microbial life', 'microbial activity'], relatedTerms: ['microbe', 'bacterium', 'organism'],
      vocabularyTopic: 'Biology',
      examples: [
        { en: 'Microbial life can survive in extreme environments.', vi: 'Sự sống vi sinh vật có thể tồn tại trong môi trường khắc nghiệt.' },
        { en: 'The soil sample showed signs of microbial activity.', vi: 'Mẫu đất cho thấy dấu hiệu hoạt động vi sinh vật.' },
      ],
    },
  ],
  [
    {
      value: 'samples', wordDisplay: 'samples', lemma: 'sample', normalizedLemma: 'sample',
      unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈsæm.pəlz/', cefrLevel: 'B1',
      contextualMeaningVi: 'mẫu vật',
      definitionEn: 'Small amounts of something taken for testing or analysis.',
      contextualExplanation: 'Rock and soil samples collected by the Perseverance rover.',
      synonyms: ['specimens', 'examples'], antonyms: [],
      collocations: ['collect samples', 'analyze samples'], relatedTerms: ['specimen', 'test', 'data'],
      vocabularyTopic: 'Science',
      examples: [
        { en: 'The lab analyzed blood samples from the patients.', vi: 'Phòng thí nghiệm phân tích mẫu máu từ bệnh nhân.' },
        { en: 'Water samples were collected from the river.', vi: 'Mẫu nước được thu thập từ sông.' },
      ],
    },
    {
      value: 'organic molecules', wordDisplay: 'organic molecules', lemma: 'organic molecule', normalizedLemma: 'organic molecule',
      unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/ɔːrˈɡæn.ɪk ˈmɒl.ɪ.kjuːlz/', cefrLevel: 'B2',
      contextualMeaningVi: 'phân tử hữu cơ',
      definitionEn: 'Carbon-based chemical compounds that are associated with living organisms.',
      contextualExplanation: 'Key evidence: the presence of organic molecules may indicate past biological activity.',
      synonyms: ['carbon compounds'], antonyms: ['inorganic compounds'],
      collocations: ['complex organic molecules', 'detect organic molecules'], relatedTerms: ['chemistry', 'carbon', 'biochemistry'],
      vocabularyTopic: 'Chemistry',
      examples: [
        { en: 'Organic molecules are the building blocks of life.', vi: 'Phân tử hữu cơ là nền tảng của sự sống.' },
        { en: 'The telescope detected organic molecules in the distant galaxy.', vi: 'Kính viễn vọng phát hiện phân tử hữu cơ trong thiên hà xa xôi.' },
      ],
    },
    {
      value: 'biological', wordDisplay: 'biological', lemma: 'biological', normalizedLemma: 'biological',
      unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˌbaɪ.əˈlɒdʒ.ɪ.kəl/', cefrLevel: 'B1',
      contextualMeaningVi: 'thuộc sinh học',
      definitionEn: 'Relating to biology or living organisms.',
      contextualExplanation: 'Used to describe the natural processes that may have created the organic molecules.',
      synonyms: ['organic', 'living'], antonyms: ['non-biological', 'abiotic'],
      collocations: ['biological processes', 'biological diversity'], relatedTerms: ['biology', 'organism', 'life'],
      vocabularyTopic: 'Science',
      examples: [
        { en: 'Biological research has led to many medical breakthroughs.', vi: 'Nghiên cứu sinh học đã dẫn đến nhiều đột phá y học.' },
        { en: 'The biological clock regulates our sleep patterns.', vi: 'Đồng hồ sinh học điều chỉnh chu kỳ giấc ngủ của chúng ta.' },
      ],
    },
  ],
  [
    {
      value: 'caution', wordDisplay: 'caution', lemma: 'caution', normalizedLemma: 'caution',
      unitType: 'WORD', partOfSpeech: 'verb', ipa: '/ˈkɔː.ʃən/', cefrLevel: 'B2',
      contextualMeaningVi: 'cảnh báo, lưu ý',
      definitionEn: 'To warn someone about a potential danger or problem.',
      contextualExplanation: 'Scientists are warning against jumping to conclusions about the findings.',
      synonyms: ['warn', 'advise'], antonyms: ['encourage', 'reassure'],
      collocations: ['caution against', 'urge caution'], relatedTerms: ['warning', 'careful', 'prudent'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'Doctors caution against excessive screen time.', vi: 'Bác sĩ cảnh báo về thời gian sử dụng màn hình quá mức.' },
        { en: 'He cautioned his team to verify every detail.', vi: 'Anh ấy cảnh báo nhóm xác minh mọi chi tiết.' },
      ],
    },
    {
      value: 'rule out', wordDisplay: 'rule out', lemma: 'rule out', normalizedLemma: 'rule out',
      unitType: 'PHRASE', partOfSpeech: 'verb', ipa: '/ˈruːl aʊt/', cefrLevel: 'B2',
      contextualMeaningVi: 'loại trừ',
      definitionEn: 'To eliminate something as a possibility.',
      contextualExplanation: 'Scientists need to eliminate non-living explanations before confirming life.',
      synonyms: ['eliminate', 'exclude'], antonyms: ['include', 'consider'],
      collocations: ['rule out the possibility', 'cannot rule out'], relatedTerms: ['exclude', 'dismiss', 'reject'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'Doctors ruled out cancer after the tests.', vi: 'Bác sĩ loại trừ ung thư sau các xét nghiệm.' },
        { en: 'We cannot rule out a technical malfunction.', vi: 'Chúng ta không thể loại trừ lỗi kỹ thuật.' },
      ],
    },
    {
      value: 'findings', wordDisplay: 'findings', lemma: 'finding', normalizedLemma: 'finding',
      unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈfaɪn.dɪŋz/', cefrLevel: 'B1',
      contextualMeaningVi: 'phát hiện, kết quả nghiên cứu',
      definitionEn: 'The results of an investigation or research.',
      contextualExplanation: 'Refers to the organic molecules discovered by the rover.',
      synonyms: ['results', 'discoveries'], antonyms: [],
      collocations: ['research findings', 'key findings'], relatedTerms: ['discovery', 'conclusion', 'result'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'The findings were published in a leading journal.', vi: 'Các phát hiện được công bố trên tạp chí hàng đầu.' },
        { en: 'Our findings suggest a link between diet and health.', vi: 'Phát hiện của chúng tôi cho thấy mối liên hệ giữa chế độ ăn và sức khỏe.' },
      ],
    },
  ],
  [
    {
      value: 'joint effort', wordDisplay: 'joint effort', lemma: 'joint effort', normalizedLemma: 'joint effort',
      unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/dʒɔɪnt ˈef.ɚt/', cefrLevel: 'B1',
      contextualMeaningVi: 'nỗ lực chung',
      definitionEn: 'A collaborative undertaking by two or more parties.',
      contextualExplanation: 'NASA and ESA are working together on the sample return mission.',
      synonyms: ['collaboration', 'partnership'], antonyms: ['solo effort', 'individual effort'],
      collocations: ['joint effort between', 'a joint effort to'], relatedTerms: ['cooperation', 'teamwork', 'alliance'],
      vocabularyTopic: 'Collaboration',
      examples: [
        { en: 'The cleanup was a joint effort by the community.', vi: 'Việc dọn dẹp là nỗ lực chung của cộng đồng.' },
        { en: 'The project succeeded through a joint effort of three departments.', vi: 'Dự án thành công nhờ nỗ lực chung của ba phòng ban.' },
      ],
    },
    {
      value: 'specimens', wordDisplay: 'specimens', lemma: 'specimen', normalizedLemma: 'specimen',
      unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈspes.ə.mənz/', cefrLevel: 'B2',
      contextualMeaningVi: 'mẫu vật',
      definitionEn: 'Individual examples of an animal, plant, or substance used for scientific study.',
      contextualExplanation: 'The Martian rock and soil specimens that will be brought to Earth.',
      synonyms: ['samples', 'examples'], antonyms: [],
      collocations: ['collect specimens', 'laboratory specimens'], relatedTerms: ['sample', 'example', 'artifact'],
      vocabularyTopic: 'Science',
      examples: [
        { en: 'The museum displayed rare fossil specimens.', vi: 'Bảo tàng trưng bày mẫu hóa thạch quý hiếm.' },
        { en: 'Specimens must be stored at the correct temperature.', vi: 'Mẫu vật phải được bảo quản ở nhiệt độ chính xác.' },
      ],
    },
    {
      value: 'mission', wordDisplay: 'mission', lemma: 'mission', normalizedLemma: 'mission',
      unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈmɪʃ.ən/', cefrLevel: 'B1',
      contextualMeaningVi: 'sứ mệnh, nhiệm vụ',
      definitionEn: 'An important assignment or task, especially involving a journey.',
      contextualExplanation: 'The Mars Sample Return mission to retrieve collected samples.',
      synonyms: ['assignment', 'operation'], antonyms: [],
      collocations: ['space mission', 'rescue mission'], relatedTerms: ['expedition', 'quest', 'objective'],
      vocabularyTopic: 'Space Exploration',
      examples: [
        { en: 'The mission to the International Space Station lasted six months.', vi: 'Sứ mệnh tới Trạm Vũ trụ Quốc tế kéo dài sáu tháng.' },
        { en: 'The rescue mission saved all survivors.', vi: 'Sứ mệnh cứu hộ đã cứu tất cả những người sống sót.' },
      ],
    },
  ],
  [
    {
      value: 'confirmed', wordDisplay: 'confirmed', lemma: 'confirm', normalizedLemma: 'confirm',
      unitType: 'WORD', partOfSpeech: 'verb', ipa: '/kənˈfɜːrmd/', cefrLevel: 'B1',
      contextualMeaningVi: 'xác nhận',
      definitionEn: 'To establish the truth or correctness of something.',
      contextualExplanation: 'The discovery still requires scientific confirmation.',
      synonyms: ['verified', 'validated'], antonyms: ['denied', 'refuted'],
      collocations: ['confirmed by', 'officially confirmed'], relatedTerms: ['confirmation', 'verify', 'validate'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'The results were confirmed by an independent laboratory.', vi: 'Kết quả đã được xác nhận bởi phòng thí nghiệm độc lập.' },
        { en: 'Please confirm your attendance by Friday.', vi: 'Vui lòng xác nhận sự tham gia trước thứ Sáu.' },
      ],
    },
    {
      value: 'fundamentally', wordDisplay: 'fundamentally', lemma: 'fundamentally', normalizedLemma: 'fundamentally',
      unitType: 'WORD', partOfSpeech: 'adverb', ipa: '/ˌfʌn.dəˈmen.t̬əl.i/', cefrLevel: 'B2',
      contextualMeaningVi: 'về cơ bản, từ gốc rễ',
      definitionEn: 'In a basic and essential way; at the most important level.',
      contextualExplanation: 'Finding life on Mars would change our basic understanding of life itself.',
      synonyms: ['essentially', 'basically'], antonyms: ['superficially', 'marginally'],
      collocations: ['fundamentally change', 'fundamentally different'], relatedTerms: ['fundamental', 'core', 'basic'],
      vocabularyTopic: 'Academic',
      examples: [
        { en: 'The internet has fundamentally changed communication.', vi: 'Internet đã thay đổi căn bản cách giao tiếp.' },
        { en: 'Their approaches are fundamentally different.', vi: 'Phương pháp của họ khác nhau căn bản.' },
      ],
    },
    {
      value: 'alter', wordDisplay: 'alter', lemma: 'alter', normalizedLemma: 'alter',
      unitType: 'WORD', partOfSpeech: 'verb', ipa: '/ˈɔːl.tɚ/', cefrLevel: 'B2',
      contextualMeaningVi: 'thay đổi',
      definitionEn: 'To change or modify something.',
      contextualExplanation: 'Our view of the universe would be changed if Martian life is confirmed.',
      synonyms: ['change', 'modify'], antonyms: ['preserve', 'maintain'],
      collocations: ['alter the course', 'alter perception'], relatedTerms: ['alteration', 'modify', 'adjust'],
      vocabularyTopic: 'Change & Development',
      examples: [
        { en: 'Climate change could alter weather patterns worldwide.', vi: 'Biến đổi khí hậu có thể thay đổi các mô hình thời tiết trên toàn thế giới.' },
        { en: 'The new evidence altered the investigation\'s direction.', vi: 'Bằng chứng mới đã thay đổi hướng điều tra.' },
      ],
    },
  ],
];

// ──────────────────────────────────────────────────────────────────────
// Article 3: Sleep and Mental Health (Health, A2)
// ──────────────────────────────────────────────────────────────────────
const sleepSentences: SentenceData[] = [
  {
    text: 'A new study shows that getting enough sleep is very important for your mental health.',
    translationVi: 'Một nghiên cứu mới cho thấy ngủ đủ giấc rất quan trọng đối với sức khỏe tinh thần của bạn.',
    explanationVi: 'Câu giới thiệu kết quả nghiên cứu chính: giấc ngủ ảnh hưởng đến sức khỏe tinh thần.',
    termTexts: ['study', 'mental health', 'enough'],
  },
  {
    text: 'People who sleep less than six hours a night often feel stressed and anxious during the day.',
    translationVi: 'Những người ngủ ít hơn sáu giờ mỗi đêm thường cảm thấy căng thẳng và lo lắng trong ngày.',
    explanationVi: 'Nêu hậu quả cụ thể của thiếu ngủ: stress và lo âu.',
    termTexts: ['stressed', 'anxious', 'less than'],
  },
  {
    text: 'Doctors recommend turning off electronic devices at least one hour before bedtime.',
    translationVi: 'Bác sĩ khuyên nên tắt các thiết bị điện tử ít nhất một giờ trước khi đi ngủ.',
    explanationVi: 'Lời khuyên thực tế từ bác sĩ: hạn chế thiết bị điện tử trước giờ ngủ.',
    termTexts: ['recommend', 'electronic devices', 'bedtime'],
  },
  {
    text: 'Regular exercise and a consistent sleep schedule can help you fall asleep faster.',
    translationVi: 'Tập thể dục thường xuyên và lịch ngủ đều đặn có thể giúp bạn ngủ nhanh hơn.',
    explanationVi: 'Hai biện pháp cải thiện giấc ngủ: vận động và giữ giờ ngủ cố định.',
    termTexts: ['regular', 'consistent', 'fall asleep'],
  },
  {
    text: 'If you have trouble sleeping for more than two weeks, you should talk to a doctor.',
    translationVi: 'Nếu bạn gặp khó khăn khi ngủ hơn hai tuần, bạn nên nói chuyện với bác sĩ.',
    explanationVi: 'Cảnh báo: mất ngủ kéo dài cần được thăm khám y tế.',
    termTexts: ['trouble', 'should', 'more than'],
  },
];

const sleepTerms: TermData[][] = [
  [
    { value: 'study', wordDisplay: 'study', lemma: 'study', normalizedLemma: 'study', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈstʌd.i/', cefrLevel: 'A2', contextualMeaningVi: 'nghiên cứu', definitionEn: 'A detailed investigation of a subject.', contextualExplanation: 'Refers to a scientific research project on sleep and health.', synonyms: ['research', 'investigation'], antonyms: [], collocations: ['conduct a study', 'a recent study'], relatedTerms: ['research', 'survey', 'experiment'], vocabularyTopic: 'Science', examples: [{ en: 'A study found that reading improves memory.', vi: 'Một nghiên cứu phát hiện rằng đọc sách cải thiện trí nhớ.' }, { en: 'The study involved 1,000 participants.', vi: 'Nghiên cứu có sự tham gia của 1.000 người.' }] },
    { value: 'mental health', wordDisplay: 'mental health', lemma: 'mental health', normalizedLemma: 'mental health', unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/ˈmen.təl helθ/', cefrLevel: 'A2', contextualMeaningVi: 'sức khỏe tinh thần', definitionEn: 'A person\'s psychological and emotional well-being.', contextualExplanation: 'The article focuses on how sleep affects psychological health.', synonyms: ['psychological health', 'emotional well-being'], antonyms: [], collocations: ['mental health awareness', 'mental health support'], relatedTerms: ['well-being', 'psychology', 'stress'], vocabularyTopic: 'Health', examples: [{ en: 'Schools are investing more in mental health programs.', vi: 'Các trường đang đầu tư nhiều hơn vào chương trình sức khỏe tinh thần.' }, { en: 'Exercise is good for both physical and mental health.', vi: 'Tập thể dục tốt cho cả sức khỏe thể chất và tinh thần.' }] },
    { value: 'enough', wordDisplay: 'enough', lemma: 'enough', normalizedLemma: 'enough', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ɪˈnʌf/', cefrLevel: 'A1', contextualMeaningVi: 'đủ', definitionEn: 'As much as is necessary.', contextualExplanation: 'Getting sufficient sleep — usually 7 to 9 hours for adults.', synonyms: ['sufficient', 'adequate'], antonyms: ['insufficient', 'inadequate'], collocations: ['enough time', 'enough sleep'], relatedTerms: ['sufficient', 'plenty', 'ample'], vocabularyTopic: 'Daily Life', examples: [{ en: 'Do you get enough sleep every night?', vi: 'Bạn có ngủ đủ giấc mỗi đêm không?' }, { en: 'There was not enough food for everyone.', vi: 'Không có đủ thức ăn cho mọi người.' }] },
  ],
  [
    { value: 'stressed', wordDisplay: 'stressed', lemma: 'stressed', normalizedLemma: 'stressed', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/strest/', cefrLevel: 'A2', contextualMeaningVi: 'căng thẳng', definitionEn: 'Feeling worried and unable to relax.', contextualExplanation: 'Lack of sleep causes people to feel tense and overwhelmed.', synonyms: ['tense', 'overwhelmed'], antonyms: ['relaxed', 'calm'], collocations: ['feel stressed', 'stressed out'], relatedTerms: ['stress', 'anxiety', 'pressure'], vocabularyTopic: 'Health', examples: [{ en: 'She felt stressed about the upcoming exam.', vi: 'Cô ấy cảm thấy căng thẳng về kỳ thi sắp tới.' }, { en: 'Too much work makes people stressed.', vi: 'Quá nhiều công việc khiến mọi người căng thẳng.' }] },
    { value: 'anxious', wordDisplay: 'anxious', lemma: 'anxious', normalizedLemma: 'anxious', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈæŋk.ʃəs/', cefrLevel: 'B1', contextualMeaningVi: 'lo lắng', definitionEn: 'Feeling worried or nervous about something.', contextualExplanation: 'Sleep deprivation increases feelings of anxiety.', synonyms: ['worried', 'nervous'], antonyms: ['calm', 'confident'], collocations: ['feel anxious', 'anxious about'], relatedTerms: ['anxiety', 'worry', 'nervousness'], vocabularyTopic: 'Health', examples: [{ en: 'He felt anxious before the job interview.', vi: 'Anh ấy cảm thấy lo lắng trước buổi phỏng vấn.' }, { en: 'Children can feel anxious about starting a new school.', vi: 'Trẻ em có thể cảm thấy lo lắng khi bắt đầu trường mới.' }] },
    { value: 'less than', wordDisplay: 'less than', lemma: 'less than', normalizedLemma: 'less than', unitType: 'PHRASE', partOfSpeech: 'adverb', ipa: '/les ðæn/', cefrLevel: 'A2', contextualMeaningVi: 'ít hơn', definitionEn: 'A smaller amount compared to something.', contextualExplanation: 'Quantifies the insufficient amount of sleep (under six hours).', synonyms: ['fewer than', 'under'], antonyms: ['more than', 'over'], collocations: ['less than expected', 'less than average'], relatedTerms: ['fewer', 'under', 'below'], vocabularyTopic: 'Quantity', examples: [{ en: 'Less than 50% of students passed the test.', vi: 'Ít hơn 50% học sinh đạt bài kiểm tra.' }, { en: 'The trip takes less than an hour.', vi: 'Chuyến đi mất ít hơn một giờ.' }] },
  ],
  [
    { value: 'recommend', wordDisplay: 'recommend', lemma: 'recommend', normalizedLemma: 'recommend', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/ˌrek.əˈmend/', cefrLevel: 'A2', contextualMeaningVi: 'khuyên, đề nghị', definitionEn: 'To suggest something as a good course of action.', contextualExplanation: 'Doctors give professional advice about sleep habits.', synonyms: ['suggest', 'advise'], antonyms: ['discourage', 'oppose'], collocations: ['highly recommend', 'recommend that'], relatedTerms: ['suggestion', 'advice', 'counsel'], vocabularyTopic: 'Health', examples: [{ en: 'I recommend this book to all students.', vi: 'Tôi khuyên cuốn sách này cho tất cả học sinh.' }, { en: 'Experts recommend drinking eight glasses of water daily.', vi: 'Chuyên gia khuyên uống tám cốc nước mỗi ngày.' }] },
    { value: 'electronic devices', wordDisplay: 'electronic devices', lemma: 'electronic device', normalizedLemma: 'electronic device', unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/ɪˌlek.ˈtrɒn.ɪk dɪˈvaɪsɪz/', cefrLevel: 'A2', contextualMeaningVi: 'thiết bị điện tử', definitionEn: 'Machines that use electrical circuits, such as phones and computers.', contextualExplanation: 'Phones, tablets, and computers that emit blue light and disrupt sleep.', synonyms: ['gadgets', 'electronics'], antonyms: [], collocations: ['use electronic devices', 'turn off electronic devices'], relatedTerms: ['smartphone', 'tablet', 'screen time'], vocabularyTopic: 'Technology', examples: [{ en: 'Children spend too much time on electronic devices.', vi: 'Trẻ em dành quá nhiều thời gian trên thiết bị điện tử.' }, { en: 'Please turn off all electronic devices during the flight.', vi: 'Vui lòng tắt tất cả thiết bị điện tử trong chuyến bay.' }] },
    { value: 'bedtime', wordDisplay: 'bedtime', lemma: 'bedtime', normalizedLemma: 'bedtime', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈbed.taɪm/', cefrLevel: 'A2', contextualMeaningVi: 'giờ đi ngủ', definitionEn: 'The usual time when someone goes to bed.', contextualExplanation: 'The period before sleeping when screen use should be avoided.', synonyms: ['sleeping time'], antonyms: ['wake-up time'], collocations: ['before bedtime', 'bedtime routine'], relatedTerms: ['sleep', 'night', 'rest'], vocabularyTopic: 'Daily Life', examples: [{ en: 'Reading before bedtime helps you relax.', vi: 'Đọc sách trước giờ ngủ giúp bạn thư giãn.' }, { en: 'My bedtime is usually 10 PM.', vi: 'Giờ đi ngủ của tôi thường là 10 giờ tối.' }] },
  ],
  [
    { value: 'regular', wordDisplay: 'regular', lemma: 'regular', normalizedLemma: 'regular', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈreɡ.jə.lɚ/', cefrLevel: 'A2', contextualMeaningVi: 'thường xuyên, đều đặn', definitionEn: 'Done or happening frequently.', contextualExplanation: 'Exercising on a consistent basis helps improve sleep quality.', synonyms: ['frequent', 'routine'], antonyms: ['irregular', 'occasional'], collocations: ['regular exercise', 'on a regular basis'], relatedTerms: ['routine', 'habit', 'consistent'], vocabularyTopic: 'Health', examples: [{ en: 'Regular exercise reduces the risk of heart disease.', vi: 'Tập thể dục đều đặn giảm nguy cơ bệnh tim.' }, { en: 'She has regular check-ups with her doctor.', vi: 'Cô ấy khám sức khỏe định kỳ với bác sĩ.' }] },
    { value: 'consistent', wordDisplay: 'consistent', lemma: 'consistent', normalizedLemma: 'consistent', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/kənˈsɪs.tənt/', cefrLevel: 'B1', contextualMeaningVi: 'nhất quán, đều đặn', definitionEn: 'Always behaving in the same way; unchanging.', contextualExplanation: 'A fixed sleep schedule that doesn\'t change from day to day.', synonyms: ['steady', 'uniform'], antonyms: ['inconsistent', 'erratic'], collocations: ['consistent with', 'consistent results'], relatedTerms: ['consistency', 'stable', 'reliable'], vocabularyTopic: 'Personal Development', examples: [{ en: 'Consistent effort leads to success.', vi: 'Nỗ lực nhất quán dẫn đến thành công.' }, { en: 'Her performance has been consistent throughout the year.', vi: 'Hiệu suất của cô ấy nhất quán suốt cả năm.' }] },
    { value: 'fall asleep', wordDisplay: 'fall asleep', lemma: 'fall asleep', normalizedLemma: 'fall asleep', unitType: 'PHRASE', partOfSpeech: 'verb', ipa: '/fɔːl əˈsliːp/', cefrLevel: 'A2', contextualMeaningVi: 'ngủ thiếp đi', definitionEn: 'To begin to sleep.', contextualExplanation: 'The goal is to fall asleep more quickly at night.', synonyms: ['doze off', 'drift off'], antonyms: ['wake up', 'stay awake'], collocations: ['fall asleep quickly', 'struggle to fall asleep'], relatedTerms: ['sleep', 'nap', 'doze'], vocabularyTopic: 'Daily Life', examples: [{ en: 'I usually fall asleep within ten minutes.', vi: 'Tôi thường ngủ thiếp đi trong vòng mười phút.' }, { en: 'The baby fell asleep in her mother\'s arms.', vi: 'Em bé ngủ thiếp đi trong vòng tay mẹ.' }] },
  ],
  [
    { value: 'trouble', wordDisplay: 'trouble', lemma: 'trouble', normalizedLemma: 'trouble', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈtrʌb.əl/', cefrLevel: 'A2', contextualMeaningVi: 'khó khăn, vấn đề', definitionEn: 'Difficulty or problems.', contextualExplanation: 'Having difficulty falling or staying asleep.', synonyms: ['difficulty', 'problem'], antonyms: ['ease', 'comfort'], collocations: ['have trouble', 'cause trouble'], relatedTerms: ['problem', 'issue', 'difficulty'], vocabularyTopic: 'Daily Life', examples: [{ en: 'He had trouble understanding the instructions.', vi: 'Anh ấy gặp khó khăn khi hiểu hướng dẫn.' }, { en: 'If you have any trouble, ask for help.', vi: 'Nếu bạn gặp bất kỳ khó khăn nào, hãy nhờ giúp đỡ.' }] },
    { value: 'should', wordDisplay: 'should', lemma: 'should', normalizedLemma: 'should', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/ʃʊd/', cefrLevel: 'A1', contextualMeaningVi: 'nên', definitionEn: 'Used to give advice or make a recommendation.', contextualExplanation: 'Giving advice: it is important to consult a medical professional.', synonyms: ['ought to', 'had better'], antonyms: ['should not'], collocations: ['you should', 'should try'], relatedTerms: ['must', 'ought', 'need'], vocabularyTopic: 'Communication', examples: [{ en: 'You should eat more vegetables.', vi: 'Bạn nên ăn nhiều rau hơn.' }, { en: 'Students should review their notes daily.', vi: 'Học sinh nên ôn bài hàng ngày.' }] },
    { value: 'more than', wordDisplay: 'more than', lemma: 'more than', normalizedLemma: 'more than', unitType: 'PHRASE', partOfSpeech: 'adverb', ipa: '/mɔːr ðæn/', cefrLevel: 'A1', contextualMeaningVi: 'nhiều hơn', definitionEn: 'A greater amount compared to something.', contextualExplanation: 'Lasting longer than two weeks is a sign to seek medical help.', synonyms: ['over', 'above'], antonyms: ['less than', 'under'], collocations: ['more than enough', 'more than expected'], relatedTerms: ['greater', 'above', 'exceeding'], vocabularyTopic: 'Quantity', examples: [{ en: 'More than 80% of participants agreed.', vi: 'Hơn 80% người tham gia đồng ý.' }, { en: 'The event attracted more than 500 people.', vi: 'Sự kiện thu hút hơn 500 người.' }] },
  ],
];

// ──────────────────────────────────────────────────────────────────────
// Article 4: Remote Work Revolution (Business, B1)
// ──────────────────────────────────────────────────────────────────────
const remoteSentences: SentenceData[] = [
  {
    text: 'Remote work has become a permanent feature of the modern workplace, with many companies adopting hybrid models.',
    translationVi: 'Làm việc từ xa đã trở thành đặc điểm cố định của nơi làm việc hiện đại, với nhiều công ty áp dụng mô hình kết hợp.',
    explanationVi: 'Câu mở đầu khẳng định làm việc từ xa không còn là xu hướng tạm thời.',
    termTexts: ['permanent', 'workplace', 'hybrid'],
  },
  {
    text: 'Employees report higher productivity when they can choose where and when to work.',
    translationVi: 'Nhân viên báo cáo năng suất cao hơn khi họ có thể chọn nơi và thời gian làm việc.',
    explanationVi: 'Lợi ích chính: sự linh hoạt giúp tăng năng suất.',
    termTexts: ['employees', 'productivity', 'choose'],
  },
  {
    text: 'However, managers face challenges in maintaining team cohesion and company culture remotely.',
    translationVi: 'Tuy nhiên, các nhà quản lý gặp thách thức trong việc duy trì sự gắn kết nhóm và văn hóa công ty từ xa.',
    explanationVi: 'Mặt trái: khó giữ sự kết nối giữa các thành viên khi làm việc từ xa.',
    termTexts: ['challenges', 'cohesion', 'company culture'],
  },
  {
    text: 'Technology platforms like video conferencing and project management tools have made collaboration across time zones possible.',
    translationVi: 'Các nền tảng công nghệ như hội nghị truyền hình và công cụ quản lý dự án đã giúp cộng tác xuyên múi giờ trở nên khả thi.',
    explanationVi: 'Công nghệ là yếu tố then chốt giúp làm việc từ xa hoạt động hiệu quả.',
    termTexts: ['collaboration', 'time zones', 'platforms'],
  },
  {
    text: 'Experts predict that flexible work arrangements will become the standard rather than the exception within the next decade.',
    translationVi: 'Chuyên gia dự đoán rằng các sắp xếp công việc linh hoạt sẽ trở thành tiêu chuẩn thay vì ngoại lệ trong thập kỷ tới.',
    explanationVi: 'Dự đoán xu hướng tương lai: làm việc linh hoạt sẽ là chuẩn mực.',
    termTexts: ['predict', 'arrangements', 'exception'],
  },
];

const remoteTerms: TermData[][] = [
  [
    { value: 'permanent', wordDisplay: 'permanent', lemma: 'permanent', normalizedLemma: 'permanent', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈpɜːr.mə.nənt/', cefrLevel: 'B1', contextualMeaningVi: 'vĩnh viễn, cố định', definitionEn: 'Lasting or intended to last indefinitely.', contextualExplanation: 'Remote work is no longer temporary — it has become a lasting part of how businesses operate.', synonyms: ['lasting', 'enduring'], antonyms: ['temporary', 'short-term'], collocations: ['permanent position', 'permanent change'], relatedTerms: ['persistent', 'fixed', 'stable'], vocabularyTopic: 'Business', examples: [{ en: 'She was offered a permanent contract.', vi: 'Cô ấy được đề nghị hợp đồng dài hạn.' }, { en: 'The damage to the building was permanent.', vi: 'Thiệt hại cho tòa nhà là vĩnh viễn.' }] },
    { value: 'workplace', wordDisplay: 'workplace', lemma: 'workplace', normalizedLemma: 'workplace', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈwɜːrk.pleɪs/', cefrLevel: 'B1', contextualMeaningVi: 'nơi làm việc', definitionEn: 'A place where people work, such as an office.', contextualExplanation: 'The concept of the workplace now includes home offices and co-working spaces.', synonyms: ['office', 'work environment'], antonyms: [], collocations: ['modern workplace', 'workplace culture'], relatedTerms: ['office', 'company', 'work'], vocabularyTopic: 'Business', examples: [{ en: 'Safety in the workplace is a top priority.', vi: 'An toàn tại nơi làm việc là ưu tiên hàng đầu.' }, { en: 'The workplace has changed dramatically since the pandemic.', vi: 'Nơi làm việc đã thay đổi đáng kể kể từ đại dịch.' }] },
    { value: 'hybrid', wordDisplay: 'hybrid', lemma: 'hybrid', normalizedLemma: 'hybrid', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈhaɪ.brɪd/', cefrLevel: 'B2', contextualMeaningVi: 'kết hợp, lai', definitionEn: 'Combining two different elements.', contextualExplanation: 'A work model that mixes in-office and remote working days.', synonyms: ['mixed', 'blended'], antonyms: ['pure', 'uniform'], collocations: ['hybrid model', 'hybrid work'], relatedTerms: ['combination', 'mixed', 'blend'], vocabularyTopic: 'Business', examples: [{ en: 'Many companies now offer hybrid work schedules.', vi: 'Nhiều công ty hiện cung cấp lịch làm việc kết hợp.' }, { en: 'The hybrid car uses both electric and petrol engines.', vi: 'Xe hybrid sử dụng cả động cơ điện và xăng.' }] },
  ],
  [
    { value: 'employees', wordDisplay: 'employees', lemma: 'employee', normalizedLemma: 'employee', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ɪmˈplɔɪ.iːz/', cefrLevel: 'A2', contextualMeaningVi: 'nhân viên', definitionEn: 'People who are hired to work for a company.', contextualExplanation: 'Workers who benefit from flexible remote work arrangements.', synonyms: ['workers', 'staff'], antonyms: ['employers'], collocations: ['company employees', 'full-time employees'], relatedTerms: ['employer', 'worker', 'staff'], vocabularyTopic: 'Business', examples: [{ en: 'The company has over 500 employees.', vi: 'Công ty có hơn 500 nhân viên.' }, { en: 'Employees are entitled to annual leave.', vi: 'Nhân viên được quyền nghỉ phép hàng năm.' }] },
    { value: 'productivity', wordDisplay: 'productivity', lemma: 'productivity', normalizedLemma: 'productivity', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˌprɒd.ʌkˈtɪv.ə.t̬i/', cefrLevel: 'B2', contextualMeaningVi: 'năng suất', definitionEn: 'The rate at which goods or work is produced.', contextualExplanation: 'Employees working from home get more done according to surveys.', synonyms: ['efficiency', 'output'], antonyms: ['inefficiency'], collocations: ['increase productivity', 'productivity levels'], relatedTerms: ['efficiency', 'performance', 'output'], vocabularyTopic: 'Business', examples: [{ en: 'New tools increased the team\'s productivity by 20%.', vi: 'Công cụ mới tăng năng suất nhóm lên 20%.' }, { en: 'Productivity tends to drop when people are stressed.', vi: 'Năng suất có xu hướng giảm khi mọi người căng thẳng.' }] },
    { value: 'choose', wordDisplay: 'choose', lemma: 'choose', normalizedLemma: 'choose', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/tʃuːz/', cefrLevel: 'A1', contextualMeaningVi: 'chọn', definitionEn: 'To pick out from a number of options.', contextualExplanation: 'Having the freedom to select work location and hours.', synonyms: ['select', 'pick'], antonyms: ['reject'], collocations: ['choose to', 'choose between'], relatedTerms: ['choice', 'option', 'decision'], vocabularyTopic: 'Daily Life', examples: [{ en: 'You can choose any color you like.', vi: 'Bạn có thể chọn bất kỳ màu nào bạn thích.' }, { en: 'She chose to study abroad.', vi: 'Cô ấy chọn du học.' }] },
  ],
  [
    { value: 'challenges', wordDisplay: 'challenges', lemma: 'challenge', normalizedLemma: 'challenge', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈtʃæl.ɪn.dʒɪz/', cefrLevel: 'B1', contextualMeaningVi: 'thách thức', definitionEn: 'Difficult tasks or problems that test abilities.', contextualExplanation: 'The difficulties managers face when leading remote teams.', synonyms: ['difficulties', 'obstacles'], antonyms: ['opportunities'], collocations: ['face challenges', 'overcome challenges'], relatedTerms: ['obstacle', 'difficulty', 'hurdle'], vocabularyTopic: 'Business', examples: [{ en: 'Every business faces unique challenges.', vi: 'Mỗi doanh nghiệp đối mặt với thách thức riêng.' }, { en: 'Climate change presents significant challenges.', vi: 'Biến đổi khí hậu đặt ra những thách thức đáng kể.' }] },
    { value: 'cohesion', wordDisplay: 'cohesion', lemma: 'cohesion', normalizedLemma: 'cohesion', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/koʊˈhiː.ʒən/', cefrLevel: 'C1', contextualMeaningVi: 'sự gắn kết', definitionEn: 'The act of forming a united whole; togetherness.', contextualExplanation: 'Keeping team members connected and working well together when they are physically apart.', synonyms: ['unity', 'solidarity'], antonyms: ['division', 'fragmentation'], collocations: ['team cohesion', 'social cohesion'], relatedTerms: ['unity', 'bonding', 'togetherness'], vocabularyTopic: 'Business', examples: [{ en: 'Team-building activities improve group cohesion.', vi: 'Hoạt động xây dựng nhóm cải thiện sự gắn kết.' }, { en: 'Social cohesion is important for a stable society.', vi: 'Sự gắn kết xã hội quan trọng cho xã hội ổn định.' }] },
    { value: 'company culture', wordDisplay: 'company culture', lemma: 'company culture', normalizedLemma: 'company culture', unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/ˈkʌm.pə.ni ˈkʌl.tʃɚ/', cefrLevel: 'B2', contextualMeaningVi: 'văn hóa công ty', definitionEn: 'The shared values, behaviors, and practices within an organization.', contextualExplanation: 'The identity and atmosphere of a company that can be harder to maintain remotely.', synonyms: ['corporate culture', 'organizational culture'], antonyms: [], collocations: ['build company culture', 'strong company culture'], relatedTerms: ['work environment', 'values', 'ethos'], vocabularyTopic: 'Business', examples: [{ en: 'A positive company culture attracts talented employees.', vi: 'Văn hóa công ty tích cực thu hút nhân viên tài năng.' }, { en: 'Remote work has reshaped company culture worldwide.', vi: 'Làm việc từ xa đã định hình lại văn hóa công ty trên toàn thế giới.' }] },
  ],
  [
    { value: 'collaboration', wordDisplay: 'collaboration', lemma: 'collaboration', normalizedLemma: 'collaboration', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/kəˌlæb.əˈreɪ.ʃən/', cefrLevel: 'B2', contextualMeaningVi: 'sự cộng tác', definitionEn: 'The action of working with someone to produce something.', contextualExplanation: 'Working together across distances using digital tools.', synonyms: ['cooperation', 'teamwork'], antonyms: ['competition'], collocations: ['close collaboration', 'international collaboration'], relatedTerms: ['cooperate', 'partner', 'teamwork'], vocabularyTopic: 'Business', examples: [{ en: 'The project required collaboration between multiple teams.', vi: 'Dự án yêu cầu sự cộng tác giữa nhiều nhóm.' }, { en: 'Online tools facilitate real-time collaboration.', vi: 'Công cụ trực tuyến hỗ trợ cộng tác thời gian thực.' }] },
    { value: 'time zones', wordDisplay: 'time zones', lemma: 'time zone', normalizedLemma: 'time zone', unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/taɪm zoʊnz/', cefrLevel: 'B1', contextualMeaningVi: 'múi giờ', definitionEn: 'Regions of the globe that have the same standard time.', contextualExplanation: 'Teams working in different parts of the world with different local times.', synonyms: [], antonyms: [], collocations: ['across time zones', 'different time zones'], relatedTerms: ['UTC', 'local time', 'schedule'], vocabularyTopic: 'Geography', examples: [{ en: 'Scheduling meetings across time zones can be tricky.', vi: 'Lên lịch họp qua các múi giờ có thể khó khăn.' }, { en: 'The US spans several time zones.', vi: 'Hoa Kỳ trải dài qua nhiều múi giờ.' }] },
    { value: 'platforms', wordDisplay: 'platforms', lemma: 'platform', normalizedLemma: 'platform', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈplæt.fɔːrmz/', cefrLevel: 'B1', contextualMeaningVi: 'nền tảng', definitionEn: 'Software systems that provide a base for other applications or services.', contextualExplanation: 'Digital tools like Zoom, Slack, and Asana that enable remote work.', synonyms: ['systems', 'services'], antonyms: [], collocations: ['digital platforms', 'technology platforms'], relatedTerms: ['software', 'application', 'tool'], vocabularyTopic: 'Technology', examples: [{ en: 'Social media platforms connect billions of people.', vi: 'Các nền tảng mạng xã hội kết nối hàng tỷ người.' }, { en: 'The company built its own e-commerce platform.', vi: 'Công ty xây dựng nền tảng thương mại điện tử riêng.' }] },
  ],
  [
    { value: 'predict', wordDisplay: 'predict', lemma: 'predict', normalizedLemma: 'predict', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/prɪˈdɪkt/', cefrLevel: 'B1', contextualMeaningVi: 'dự đoán', definitionEn: 'To say what you think will happen in the future.', contextualExplanation: 'Experts are forecasting future workplace trends.', synonyms: ['forecast', 'anticipate'], antonyms: [], collocations: ['predict the future', 'experts predict'], relatedTerms: ['prediction', 'forecast', 'anticipation'], vocabularyTopic: 'Business', examples: [{ en: 'Analysts predict strong economic growth this year.', vi: 'Các nhà phân tích dự đoán tăng trưởng kinh tế mạnh mẽ năm nay.' }, { en: 'It is difficult to predict the weather accurately.', vi: 'Rất khó dự đoán thời tiết chính xác.' }] },
    { value: 'arrangements', wordDisplay: 'arrangements', lemma: 'arrangement', normalizedLemma: 'arrangement', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/əˈreɪndʒ.mənts/', cefrLevel: 'B1', contextualMeaningVi: 'sự sắp xếp', definitionEn: 'Plans or preparations for a future event or situation.', contextualExplanation: 'The different ways companies structure work schedules and locations.', synonyms: ['plans', 'setups'], antonyms: [], collocations: ['work arrangements', 'flexible arrangements'], relatedTerms: ['plan', 'schedule', 'setup'], vocabularyTopic: 'Business', examples: [{ en: 'We need to make travel arrangements for the conference.', vi: 'Chúng ta cần sắp xếp đi lại cho hội nghị.' }, { en: 'Flexible work arrangements benefit both employers and employees.', vi: 'Sắp xếp công việc linh hoạt có lợi cho cả chủ và nhân viên.' }] },
    { value: 'exception', wordDisplay: 'exception', lemma: 'exception', normalizedLemma: 'exception', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ɪkˈsep.ʃən/', cefrLevel: 'B1', contextualMeaningVi: 'ngoại lệ', definitionEn: 'Something that is not included in a general rule.', contextualExplanation: 'Remote work will no longer be unusual — it will be normal.', synonyms: ['anomaly', 'deviation'], antonyms: ['rule', 'norm'], collocations: ['with the exception of', 'no exception'], relatedTerms: ['unusual', 'special case', 'outlier'], vocabularyTopic: 'Language', examples: [{ en: 'Every student must attend, with no exception.', vi: 'Mọi học sinh phải tham dự, không có ngoại lệ.' }, { en: 'This rule applies to everyone without exception.', vi: 'Quy tắc này áp dụng cho tất cả mọi người không có ngoại lệ.' }] },
  ],
];

// ──────────────────────────────────────────────────────────────────────
// Article 5: Ocean Plastic Pollution (Environment, B2)
// ──────────────────────────────────────────────────────────────────────
const oceanSentences: SentenceData[] = [
  {
    text: 'An estimated eight million metric tons of plastic waste enters the world\'s oceans every year, threatening marine ecosystems.',
    translationVi: 'Ước tính tám triệu tấn rác thải nhựa đổ vào đại dương mỗi năm, đe dọa hệ sinh thái biển.',
    explanationVi: 'Câu mở đầu nêu quy mô vấn đề: lượng nhựa khổng lồ xâm nhập đại dương.',
    termTexts: ['estimated', 'metric tons', 'marine ecosystems'],
  },
  {
    text: 'Microplastics, tiny fragments smaller than five millimeters, have been found in seafood consumed by humans.',
    translationVi: 'Vi nhựa, các mảnh nhỏ dưới năm milimet, đã được tìm thấy trong hải sản con người tiêu thụ.',
    explanationVi: 'Hệ quả trực tiếp: vi nhựa xâm nhập chuỗi thức ăn của con người.',
    termTexts: ['Microplastics', 'fragments', 'consumed'],
  },
  {
    text: 'Governments worldwide are implementing bans on single-use plastics and investing in recycling infrastructure.',
    translationVi: 'Chính phủ trên toàn thế giới đang thực hiện lệnh cấm nhựa dùng một lần và đầu tư vào cơ sở hạ tầng tái chế.',
    explanationVi: 'Phản ứng chính sách: cấm nhựa dùng một lần và phát triển tái chế.',
    termTexts: ['implementing', 'single-use', 'infrastructure'],
  },
  {
    text: 'Innovative cleanup technologies, such as ocean barriers and autonomous collection drones, are being deployed in heavily polluted areas.',
    translationVi: 'Các công nghệ dọn dẹp đổi mới, như rào cản đại dương và máy bay thu gom tự hành, đang được triển khai tại các khu vực ô nhiễm nặng.',
    explanationVi: 'Giải pháp công nghệ: các thiết bị mới giúp thu gom rác thải từ biển.',
    termTexts: ['Innovative', 'autonomous', 'deployed'],
  },
  {
    text: 'Without urgent collective action, scientists warn that plastic in the ocean could outweigh fish by 2050.',
    translationVi: 'Nếu không có hành động tập thể khẩn cấp, các nhà khoa học cảnh báo rằng nhựa trong đại dương có thể vượt trọng lượng cá vào năm 2050.',
    explanationVi: 'Cảnh báo nghiêm trọng: nếu không hành động, nhựa sẽ nhiều hơn cá trong biển.',
    termTexts: ['collective', 'outweigh', 'urgent'],
  },
];

const oceanTerms: TermData[][] = [
  [
    { value: 'estimated', wordDisplay: 'estimated', lemma: 'estimate', normalizedLemma: 'estimate', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈes.tɪ.meɪ.tɪd/', cefrLevel: 'B1', contextualMeaningVi: 'ước tính', definitionEn: 'Roughly calculated or approximate.', contextualExplanation: 'The number is an approximation because exact measurement is difficult.', synonyms: ['approximate', 'projected'], antonyms: ['exact', 'precise'], collocations: ['estimated cost', 'estimated time'], relatedTerms: ['estimate', 'calculation', 'projection'], vocabularyTopic: 'Academic', examples: [{ en: 'The estimated cost of the project is $2 million.', vi: 'Chi phí ước tính của dự án là 2 triệu đô.' }, { en: 'An estimated 10,000 people attended the festival.', vi: 'Ước tính 10.000 người tham dự lễ hội.' }] },
    { value: 'metric tons', wordDisplay: 'metric tons', lemma: 'metric ton', normalizedLemma: 'metric ton', unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/ˈmet.rɪk tʌnz/', cefrLevel: 'B2', contextualMeaningVi: 'tấn (đơn vị đo)', definitionEn: 'A unit of weight equal to 1,000 kilograms.', contextualExplanation: 'Used to quantify the massive scale of plastic pollution.', synonyms: ['tonnes'], antonyms: [], collocations: ['million metric tons', 'metric tons of waste'], relatedTerms: ['kilogram', 'weight', 'measurement'], vocabularyTopic: 'Science', examples: [{ en: 'The factory produces 500 metric tons of steel per month.', vi: 'Nhà máy sản xuất 500 tấn thép mỗi tháng.' }, { en: 'Carbon emissions are measured in metric tons.', vi: 'Lượng khí thải carbon được đo bằng tấn.' }] },
    { value: 'marine ecosystems', wordDisplay: 'marine ecosystems', lemma: 'marine ecosystem', normalizedLemma: 'marine ecosystem', unitType: 'PHRASE', partOfSpeech: 'noun', ipa: '/məˈriːn ˈiː.koʊˌsɪs.təmz/', cefrLevel: 'B2', contextualMeaningVi: 'hệ sinh thái biển', definitionEn: 'The complex web of living organisms and their environment in the ocean.', contextualExplanation: 'Plastic pollution disrupts the delicate balance of ocean life.', synonyms: ['ocean ecosystems', 'aquatic ecosystems'], antonyms: ['terrestrial ecosystems'], collocations: ['protect marine ecosystems', 'damage to marine ecosystems'], relatedTerms: ['biodiversity', 'coral reef', 'ocean life'], vocabularyTopic: 'Environment', examples: [{ en: 'Coral reefs are vital marine ecosystems.', vi: 'Rạn san hô là hệ sinh thái biển quan trọng.' }, { en: 'Oil spills devastate marine ecosystems.', vi: 'Tràn dầu tàn phá hệ sinh thái biển.' }] },
  ],
  [
    { value: 'Microplastics', wordDisplay: 'Microplastics', lemma: 'microplastic', normalizedLemma: 'microplastic', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈmaɪ.kroʊˌplæs.tɪks/', cefrLevel: 'B2', contextualMeaningVi: 'vi nhựa', definitionEn: 'Very small pieces of plastic, less than 5mm in diameter.', contextualExplanation: 'Tiny plastic particles that are nearly impossible to remove from the environment.', synonyms: ['plastic particles'], antonyms: [], collocations: ['microplastics in water', 'microplastics pollution'], relatedTerms: ['pollution', 'plastic waste', 'contamination'], vocabularyTopic: 'Environment', examples: [{ en: 'Microplastics have been found in drinking water.', vi: 'Vi nhựa đã được tìm thấy trong nước uống.' }, { en: 'Scientists are studying the health effects of microplastics.', vi: 'Các nhà khoa học đang nghiên cứu ảnh hưởng sức khỏe của vi nhựa.' }] },
    { value: 'fragments', wordDisplay: 'fragments', lemma: 'fragment', normalizedLemma: 'fragment', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈfræɡ.mənts/', cefrLevel: 'B2', contextualMeaningVi: 'mảnh vỡ', definitionEn: 'Small pieces broken off from something larger.', contextualExplanation: 'Plastic breaks down into tiny pieces rather than decomposing naturally.', synonyms: ['pieces', 'particles'], antonyms: ['whole'], collocations: ['tiny fragments', 'bone fragments'], relatedTerms: ['piece', 'shard', 'particle'], vocabularyTopic: 'Science', examples: [{ en: 'Fragments of the ancient pottery were found at the site.', vi: 'Các mảnh gốm cổ đại được tìm thấy tại di chỉ.' }, { en: 'The glass shattered into hundreds of fragments.', vi: 'Kính vỡ thành hàng trăm mảnh.' }] },
    { value: 'consumed', wordDisplay: 'consumed', lemma: 'consume', normalizedLemma: 'consume', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/kənˈsuːmd/', cefrLevel: 'B1', contextualMeaningVi: 'tiêu thụ, ăn', definitionEn: 'To eat, drink, or use something.', contextualExplanation: 'Humans eat seafood that contains microplastics.', synonyms: ['eaten', 'ingested'], antonyms: ['produced'], collocations: ['widely consumed', 'consumed daily'], relatedTerms: ['consumption', 'consumer', 'intake'], vocabularyTopic: 'Health', examples: [{ en: 'Rice is consumed as a staple food in Asia.', vi: 'Gạo được tiêu thụ như lương thực chính ở châu Á.' }, { en: 'Americans consumed 100 billion cups of coffee last year.', vi: 'Người Mỹ tiêu thụ 100 tỷ tách cà phê năm ngoái.' }] },
  ],
  [
    { value: 'implementing', wordDisplay: 'implementing', lemma: 'implement', normalizedLemma: 'implement', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/ˈɪm.plə.men.tɪŋ/', cefrLevel: 'B2', contextualMeaningVi: 'thực hiện, triển khai', definitionEn: 'To put a plan or decision into effect.', contextualExplanation: 'Governments are putting plastic bans into practice.', synonyms: ['executing', 'enforcing'], antonyms: ['abandoning', 'repealing'], collocations: ['implementing a plan', 'implementing changes'], relatedTerms: ['implementation', 'execute', 'apply'], vocabularyTopic: 'Policy', examples: [{ en: 'The company is implementing new safety procedures.', vi: 'Công ty đang triển khai quy trình an toàn mới.' }, { en: 'Implementing the policy will take several months.', vi: 'Triển khai chính sách sẽ mất vài tháng.' }] },
    { value: 'single-use', wordDisplay: 'single-use', lemma: 'single-use', normalizedLemma: 'single-use', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˌsɪŋ.ɡəlˈjuːs/', cefrLevel: 'B1', contextualMeaningVi: 'dùng một lần', definitionEn: 'Designed to be used only once and then discarded.', contextualExplanation: 'Products like plastic bags and straws that are thrown away after one use.', synonyms: ['disposable'], antonyms: ['reusable', 'durable'], collocations: ['single-use plastics', 'single-use bags'], relatedTerms: ['disposable', 'throwaway', 'waste'], vocabularyTopic: 'Environment', examples: [{ en: 'Many countries have banned single-use plastic bags.', vi: 'Nhiều quốc gia đã cấm túi nhựa dùng một lần.' }, { en: 'Bring a reusable bottle instead of buying single-use ones.', vi: 'Mang theo bình tái sử dụng thay vì mua loại dùng một lần.' }] },
    { value: 'infrastructure', wordDisplay: 'infrastructure', lemma: 'infrastructure', normalizedLemma: 'infrastructure', unitType: 'WORD', partOfSpeech: 'noun', ipa: '/ˈɪn.frəˌstrʌk.tʃɚ/', cefrLevel: 'B2', contextualMeaningVi: 'cơ sở hạ tầng', definitionEn: 'The basic physical and organizational structures needed for a society to function.', contextualExplanation: 'Recycling facilities, collection systems, and processing plants.', synonyms: ['facilities', 'framework'], antonyms: [], collocations: ['build infrastructure', 'recycling infrastructure'], relatedTerms: ['system', 'facility', 'network'], vocabularyTopic: 'Policy', examples: [{ en: 'The government invested heavily in transport infrastructure.', vi: 'Chính phủ đầu tư mạnh vào cơ sở hạ tầng giao thông.' }, { en: 'Poor infrastructure hinders economic development.', vi: 'Cơ sở hạ tầng yếu kém cản trở phát triển kinh tế.' }] },
  ],
  [
    { value: 'Innovative', wordDisplay: 'Innovative', lemma: 'innovative', normalizedLemma: 'innovative', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈɪn.ə.veɪ.t̬ɪv/', cefrLevel: 'B2', contextualMeaningVi: 'đổi mới, sáng tạo', definitionEn: 'Introducing new ideas or methods.', contextualExplanation: 'New creative technologies being developed to clean up ocean plastic.', synonyms: ['creative', 'groundbreaking'], antonyms: ['conventional', 'traditional'], collocations: ['innovative solutions', 'innovative approach'], relatedTerms: ['innovation', 'creative', 'novel'], vocabularyTopic: 'Technology', examples: [{ en: 'The startup developed an innovative approach to recycling.', vi: 'Startup phát triển phương pháp tái chế đổi mới.' }, { en: 'Innovative thinking is essential for solving complex problems.', vi: 'Tư duy đổi mới là thiết yếu để giải quyết vấn đề phức tạp.' }] },
    { value: 'autonomous', wordDisplay: 'autonomous', lemma: 'autonomous', normalizedLemma: 'autonomous', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ɔːˈtɑː.nə.məs/', cefrLevel: 'C1', contextualMeaningVi: 'tự hành, tự chủ', definitionEn: 'Able to operate independently without human control.', contextualExplanation: 'Drones that can collect plastic waste without human operators.', synonyms: ['self-governing', 'independent'], antonyms: ['controlled', 'dependent'], collocations: ['autonomous vehicles', 'fully autonomous'], relatedTerms: ['autonomy', 'self-driving', 'automated'], vocabularyTopic: 'Technology', examples: [{ en: 'Autonomous vehicles are being tested on public roads.', vi: 'Xe tự hành đang được thử nghiệm trên đường công cộng.' }, { en: 'The region became autonomous after the referendum.', vi: 'Khu vực trở nên tự trị sau cuộc trưng cầu dân ý.' }] },
    { value: 'deployed', wordDisplay: 'deployed', lemma: 'deploy', normalizedLemma: 'deploy', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/dɪˈplɔɪd/', cefrLevel: 'B2', contextualMeaningVi: 'triển khai', definitionEn: 'To move into position or put into use.', contextualExplanation: 'Cleanup technologies being placed and activated in polluted ocean areas.', synonyms: ['installed', 'positioned'], antonyms: ['withdrawn', 'removed'], collocations: ['deployed in', 'widely deployed'], relatedTerms: ['deployment', 'install', 'launch'], vocabularyTopic: 'Technology', examples: [{ en: 'The new software was deployed across all offices.', vi: 'Phần mềm mới được triển khai tại tất cả văn phòng.' }, { en: 'Emergency teams were deployed to the disaster area.', vi: 'Đội cứu hộ được triển khai đến vùng thiên tai.' }] },
  ],
  [
    { value: 'collective', wordDisplay: 'collective', lemma: 'collective', normalizedLemma: 'collective', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/kəˈlek.tɪv/', cefrLevel: 'B2', contextualMeaningVi: 'tập thể, chung', definitionEn: 'Done by or shared among a group of people.', contextualExplanation: 'The entire global community must work together to solve this crisis.', synonyms: ['shared', 'joint'], antonyms: ['individual', 'personal'], collocations: ['collective action', 'collective effort'], relatedTerms: ['group', 'community', 'united'], vocabularyTopic: 'Social Issues', examples: [{ en: 'Collective action is needed to combat climate change.', vi: 'Hành động tập thể cần thiết để chống biến đổi khí hậu.' }, { en: 'The collective decision was to postpone the event.', vi: 'Quyết định tập thể là hoãn sự kiện.' }] },
    { value: 'outweigh', wordDisplay: 'outweigh', lemma: 'outweigh', normalizedLemma: 'outweigh', unitType: 'WORD', partOfSpeech: 'verb', ipa: '/ˌaʊtˈweɪ/', cefrLevel: 'B2', contextualMeaningVi: 'vượt trọng lượng, lớn hơn', definitionEn: 'To be heavier, greater, or more significant than.', contextualExplanation: 'A shocking prediction: there could be more plastic than fish in the ocean.', synonyms: ['exceed', 'surpass'], antonyms: ['fall short of'], collocations: ['outweigh the risks', 'benefits outweigh'], relatedTerms: ['exceed', 'surpass', 'dominate'], vocabularyTopic: 'Academic', examples: [{ en: 'The benefits of exercise outweigh the risks.', vi: 'Lợi ích của tập thể dục vượt trội hơn rủi ro.' }, { en: 'Demand currently outweighs supply.', vi: 'Nhu cầu hiện vượt quá nguồn cung.' }] },
    { value: 'urgent', wordDisplay: 'urgent', lemma: 'urgent', normalizedLemma: 'urgent', unitType: 'WORD', partOfSpeech: 'adjective', ipa: '/ˈɜːr.dʒənt/', cefrLevel: 'B1', contextualMeaningVi: 'khẩn cấp', definitionEn: 'Requiring immediate action or attention.', contextualExplanation: 'Emphasizes that the plastic pollution crisis needs to be addressed now.', synonyms: ['pressing', 'critical'], antonyms: ['unimportant', 'trivial'], collocations: ['urgent action', 'urgent need'], relatedTerms: ['urgency', 'emergency', 'critical'], vocabularyTopic: 'Social Issues', examples: [{ en: 'There is an urgent need for clean water in the region.', vi: 'Có nhu cầu khẩn cấp về nước sạch trong khu vực.' }, { en: 'The doctor said the surgery was urgent.', vi: 'Bác sĩ nói ca phẫu thuật là khẩn cấp.' }] },
  ],
];

// ─── Main seed function ───────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱 Starting seed...');

  // 1. Upsert admin user
  const passwordHash =
    '$2b$10$dummyHashForSeedDataOnlyNotForProduction000000000000';
  await prisma.user.upsert({
    where: { id: ADMIN_USER_ID },
    update: {},
    create: {
      id: ADMIN_USER_ID,
      email: 'admin@vocabmate.dev',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      profile: {
        create: {
          displayName: 'Admin',
          currentCefrLevel: 'C1',
          learningGoal: 'C2',
          preferredLanguage: 'vi',
        },
      },
    },
  });
  console.log('  ✔ Admin user upserted');

  // 2. Upsert categories
  const categoryEntries = [
    { id: CATEGORY_IDS.technology, name: 'Technology', slug: 'technology', description: 'Articles about technology, software, and digital innovation.', displayOrder: 1 },
    { id: CATEGORY_IDS.science, name: 'Science', slug: 'science', description: 'Articles about scientific discoveries, research, and exploration.', displayOrder: 2 },
    { id: CATEGORY_IDS.health, name: 'Health', slug: 'health', description: 'Articles about physical and mental health, wellness, and medicine.', displayOrder: 3 },
    { id: CATEGORY_IDS.business, name: 'Business', slug: 'business', description: 'Articles about business trends, economics, and workplace topics.', displayOrder: 4 },
    { id: CATEGORY_IDS.environment, name: 'Environment', slug: 'environment', description: 'Articles about climate change, pollution, and environmental conservation.', displayOrder: 5 },
  ];

  for (const cat of categoryEntries) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        displayOrder: cat.displayOrder,
        isActive: true,
        createdByUserId: ADMIN_USER_ID,
        updatedByUserId: ADMIN_USER_ID,
      },
    });
  }
  console.log('  ✔ Categories upserted');

  // Clean up any previously seeded articles to ensure clean sentence & term cascade
  await prisma.article.deleteMany({
    where: { id: { in: Object.values(ART) } },
  });

  // 3. Seed articles, sentences, and terms
  interface ArticleConfig {
    id: string;
    categoryId: string;
    title: string;
    slug: string;
    summary: string;
    cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    sourceName: string;
    sourceUrl: string;
    authorName: string;
    sentenceIds: string[];
    termIds: string[][];
    sentences: SentenceData[];
    terms: TermData[][];
  }

  const articles: ArticleConfig[] = [
    {
      id: ART.ai,
      categoryId: CATEGORY_IDS.technology,
      title: 'How Artificial Intelligence Is Transforming Education',
      slug: 'how-ai-is-transforming-education',
      summary:
        'Artificial intelligence is changing classrooms worldwide, offering personalized learning while raising concerns about over-reliance on technology.',
      cefrLevel: 'B1',
      sourceName: 'BBC News',
      sourceUrl: 'https://www.bbc.com/news/education',
      authorName: 'Sarah Mitchell',
      sentenceIds: SEN.ai,
      termIds: TRM.ai,
      sentences: aiSentences,
      terms: aiTerms,
    },
    {
      id: ART.mars,
      categoryId: CATEGORY_IDS.science,
      title: 'NASA Rover Finds Evidence of Ancient Life on Mars',
      slug: 'nasa-rover-finds-evidence-ancient-life-mars',
      summary:
        'Perseverance rover discoveries in Jezero Crater suggest ancient microbial life may have existed on Mars, pending further analysis.',
      cefrLevel: 'B2',
      sourceName: 'The Guardian',
      sourceUrl: 'https://www.theguardian.com/science',
      authorName: 'James Carter',
      sentenceIds: SEN.mars,
      termIds: TRM.mars,
      sentences: marsSentences,
      terms: marsTerms,
    },
    {
      id: ART.sleep,
      categoryId: CATEGORY_IDS.health,
      title: 'Why Sleep Is Essential for Your Mental Health',
      slug: 'why-sleep-is-essential-for-mental-health',
      summary:
        'Research shows that getting enough sleep improves mood, reduces stress, and strengthens mental well-being.',
      cefrLevel: 'A2',
      sourceName: 'Healthline',
      sourceUrl: 'https://www.healthline.com/health',
      authorName: 'Dr. Lisa Nguyen',
      sentenceIds: SEN.sleep,
      termIds: TRM.sleep,
      sentences: sleepSentences,
      terms: sleepTerms,
    },
    {
      id: ART.remote,
      categoryId: CATEGORY_IDS.business,
      title: 'The Remote Work Revolution: How Companies Are Adapting',
      slug: 'remote-work-revolution-how-companies-adapting',
      summary:
        'Remote work has become a permanent part of modern business, with hybrid models reshaping how teams collaborate across the globe.',
      cefrLevel: 'B1',
      sourceName: 'Forbes',
      sourceUrl: 'https://www.forbes.com/work',
      authorName: 'Michael Park',
      sentenceIds: SEN.remote,
      termIds: TRM.remote,
      sentences: remoteSentences,
      terms: remoteTerms,
    },
    {
      id: ART.ocean,
      categoryId: CATEGORY_IDS.environment,
      title: 'The Growing Crisis of Ocean Plastic Pollution',
      slug: 'growing-crisis-ocean-plastic-pollution',
      summary:
        'Millions of tons of plastic enter the ocean annually, threatening marine life and entering the human food chain through microplastics.',
      cefrLevel: 'B2',
      sourceName: 'National Geographic',
      sourceUrl: 'https://www.nationalgeographic.com/environment',
      authorName: 'Emma Torres',
      sentenceIds: SEN.ocean,
      termIds: TRM.ocean,
      sentences: oceanSentences,
      terms: oceanTerms,
    },
  ];

  const now = new Date();

  for (const art of articles) {
    const contentHtml = buildContentHtml(
      art.sentenceIds,
      art.termIds,
      art.sentences.map((s) => ({
        text: s.text,
        termTexts: s.termTexts,
      })),
    );

    // Upsert article
    await prisma.article.upsert({
      where: { id: art.id },
      update: {},
      create: {
        id: art.id,
        categoryId: art.categoryId,
        title: art.title,
        slug: art.slug,
        summary: art.summary,
        contentHtml,
        contentVersion: 1,
        sourceName: art.sourceName,
        sourceUrl: art.sourceUrl,
        authorName: art.authorName,
        cefrLevel: art.cefrLevel,
        status: 'PUBLISHED',
        publishedAt: now,
        createdByUserId: ADMIN_USER_ID,
        updatedByUserId: ADMIN_USER_ID,
      },
    });

    // Upsert sentences and terms
    for (let si = 0; si < art.sentences.length; si++) {
      const sen = art.sentences[si];
      await prisma.articleSentence.upsert({
        where: { id: art.sentenceIds[si] },
        update: {},
        create: {
          id: art.sentenceIds[si],
          articleId: art.id,
          contentVersion: 1,
          sentenceOrder: si + 1,
          sentenceText: sen.text,
          translationVi: sen.translationVi,
          explanationVi: sen.explanationVi,
          isActive: true,
          createdByUserId: ADMIN_USER_ID,
          updatedByUserId: ADMIN_USER_ID,
        },
      });

      for (let ti = 0; ti < art.terms[si].length; ti++) {
        const term = art.terms[si][ti];
        await prisma.articleSentenceTerm.upsert({
          where: { id: art.termIds[si][ti] },
          update: {},
          create: {
            id: art.termIds[si][ti],
            sentenceId: art.sentenceIds[si],
            value: term.value,
            wordDisplay: term.wordDisplay,
            lemma: term.lemma,
            normalizedLemma: term.normalizedLemma,
            unitType: term.unitType,
            partOfSpeech: term.partOfSpeech,
            ipa: term.ipa,
            cefrLevel: term.cefrLevel,
            contextualMeaningVi: term.contextualMeaningVi,
            definitionEn: term.definitionEn,
            contextualExplanation: term.contextualExplanation,
            synonyms: term.synonyms,
            antonyms: term.antonyms,
            collocations: term.collocations,
            relatedTerms: term.relatedTerms,
            vocabularyTopic: term.vocabularyTopic,
            examples: term.examples,
            isLookupEnabled: true,
            isActive: true,
            createdByUserId: ADMIN_USER_ID,
            updatedByUserId: ADMIN_USER_ID,
          },
        });
      }
    }

    console.log(`  ✔ Article seeded: "${art.title}"`);
  }

  console.log('🌱 Seed completed successfully!');
}

main()
  .catch((e: unknown) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
