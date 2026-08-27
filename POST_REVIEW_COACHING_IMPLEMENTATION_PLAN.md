# Post-Review Coaching — Kế hoạch triển khai

> Trạng thái: kế hoạch kỹ thuật, chưa triển khai  
> Phạm vi: `vocab-mate-backend` và `vocab-mate-frontend`  
> Mục tiêu: bổ sung coaching sau khi hoàn thành review session mà không tạo thêm kiến trúc không cần thiết

## 1. Kết quả mong muốn

Sau khi hoàn thành một buổi ôn, người học nhận được:

1. Phân tích các nguyên nhân thường dẫn đến câu trả lời sai.
2. Kế hoạch cụ thể cho buổi ôn tiếp theo.
3. Đề xuất một buổi luyện bổ sung ngắn từ chính các từ yếu.
4. Tối đa ba bài đọc/chủ đề phù hợp với điểm yếu.
5. So sánh kết quả hiện tại với tối đa năm buổi ôn trước.
6. Nút bắt đầu buổi ôn riêng các từ yếu ngay trên trang tổng kết.
7. Nội dung coaching dùng ngôn ngữ trong `UserProfile.preferredLanguage`.

Luồng dự kiến:

```text
Hoàn thành review session
        ↓
Backend tạo evidence có giới hạn
        ├── thống kê tiến bộ bằng backend query
        ├── chọn bài đọc thật từ database
        └── gọi AI tối đa một lần để tạo coaching có cấu trúc
        ↓
Lưu SESSION_SUMMARY khi AI output hợp lệ
        ↓
GET /review-sessions/:id/summary trả toàn bộ kết quả
        ↓
FE hiển thị coaching và cho phép bắt đầu Focus Review
```

## 2. Những gì repo đã có và sẽ tái sử dụng

| Nhu cầu | Thành phần hiện có sẽ tái sử dụng |
| --- | --- |
| Điểm, accuracy và đáp án | `ReviewSessionsRepository.getCompletedResult` |
| Kỹ năng mạnh/yếu | `skillBreakdown`, `ReviewSkillDimension` |
| Loại lỗi | `ReviewErrorType` trên `ReviewAnswer` và agent decisions |
| Từ cần xem lại | `wordsToRevisit` và `recoveredInSession` |
| AI orchestration | `ReviewAgentService` và `AiService` Gemini → Groq |
| Structured output | `ai.contracts.ts`, schema và validation hiện có |
| Lưu quyết định AI | `ReviewAgentDecision` |
| Loại quyết định tổng kết | `ReviewDecisionKind.SESSION_SUMMARY` đã tồn tại |
| Giới hạn AI call | `ReviewSession.aiCallCount` và cấu hình hiện tại |
| Câu hỏi luyện tập | `AiAssistedQuestionGeneratorService` và các `QuestionType` hiện tại |
| Session/resume/progress | `ReviewSession`, `ReviewSessionItem`, TanStack Query hooks |
| Bài đọc | `ArticlesService`, `ArticlesRepository`, article/category/reading progress |
| Ngôn ngữ | `UserProfile.preferredLanguage` và i18next `vi`/`en` |

Không tạo bảng `coaching`, microservice, queue, vector database, agent framework hoặc exercise engine mới.

### Khoảng trống của flow hiện tại

| Task | Hiện trạng trong repo | Phần còn thiếu |
| --- | --- | --- |
| 1. Nguyên nhân thường sai | Mỗi `ReviewAnswer` đã có `skillDimension`, `errorType`; agent có thể chẩn đoán từng answer | Chưa có AI summary tổng hợp pattern xuyên suốt session/lịch sử |
| 2. Kế hoạch buổi sau | `SESSION_PLAN` lập kế hoạch cho session đang bắt đầu | Chưa có plan sau khi hoàn thành để dùng cho session kế tiếp |
| 3. Bài tập bổ sung | Agent có thể requeue/retest ngay trong session; question generator đã hỗ trợ bốn loại câu hỏi | Chưa có lượt luyện ngắn được tạo từ các từ yếu sau session |
| 4. Gợi ý bài đọc | Article/category/CEFR/reading progress và public article cards đã có | Review summary chưa chọn bài đọc từ điểm yếu |
| 5. So sánh tiến bộ | Có review history và analytics tổng quát | `CompletedReviewResult` chưa so current session với các session ngay trước đó |
| 6. Ôn riêng từ yếu | FE chỉ có start Daily Review theo `reviewGoal`; BE tự chọn các từ đến hạn | Chưa có endpoint an toàn để server lấy weak words từ một completed session |
| 7. Đúng ngôn ngữ | FE đã đồng bộ i18next với `preferredLanguage` | Backend chưa sinh learner-facing summary sau session theo locale |

## 3. Quyết định kiến trúc chung

### 3.1 Chỉ một AI call cho toàn bộ phần coaching

Task 1, 2, 3 và 7 dùng chung một operation mới, ví dụ:

```ts
AiService.generateReviewSessionSummary(input)
```

Một response có cấu trúc chứa:

- chẩn đoán tổng thể;
- tối đa ba mẫu lỗi;
- kế hoạch buổi tiếp theo;
- kế hoạch Focus Review ngắn;
- lời khuyên đúng ngôn ngữ.

Không gọi riêng một lần cho từng task hoặc từng từ.

### 3.2 Backend vẫn là nguồn quyết định cuối cùng

AI chỉ được chọn từ các giá trị server cung cấp:

- `ReviewSkillDimension`;
- `ReviewErrorType`;
- `ReviewGoal`;
- `QuestionType`;
- thời lượng `5 | 10 | 15`;
- số bài luyện trong giới hạn server.

AI không được:

- đưa UUID hoặc tự chọn vocabulary/article ID;
- quyết định điểm, correctness, `nextReviewAt` hoặc learning status;
- tạo URL bài đọc;
- tạo loại bài tập mới;
- ghi database trực tiếp.

### 3.3 AI call nằm ngoài transaction

Transaction hoàn thành answer/session trước. Sau khi commit:

1. Backend tạo snapshot đã loại bỏ email, user ID và dữ liệu không liên quan.
2. Backend claim một `SESSION_SUMMARY` duy nhất.
3. AI được gọi với timeout và call budget hiện có.
4. Kết quả hợp lệ được lưu vào `ReviewAgentDecision.decisionPayload`.
5. Nếu AI lỗi, không lưu coaching; các thống kê deterministic hiện có vẫn được trả về.

### 3.4 Contract mở rộng nhưng giữ tương thích

`GET /api/v1/review-sessions/:sessionId/summary` vẫn giữ các field hiện tại và chỉ bổ sung field mới:

```json
{
  "result": {},
  "answers": [],
  "skillBreakdown": [],
  "wordsToRevisit": [],
  "coachSummary": {
    "source": "AI",
    "locale": "vi",
    "strengths": ["RECOGNITION"],
    "focusNext": ["RECALL", "SPELLING"],
    "message": "Bạn nhận diện nghĩa khá tốt nhưng cần luyện nhớ từ và chính tả.",
    "errorAnalysis": {
      "headline": "Bạn thường nhận ra nghĩa nhưng khó tự nhớ lại từ.",
      "patterns": [
        {
          "skillDimension": "RECALL",
          "errorType": "LOW_RECALL",
          "explanation": "Các lỗi tập trung ở câu hỏi yêu cầu nhớ lại từ.",
          "recommendation": "Luyện recall trước khi xem đáp án."
        }
      ]
    },
    "nextSessionPlan": {
      "reviewGoal": "RECALL",
      "targetDurationMinutes": 10,
      "focusDimensions": ["RECALL", "SPELLING"],
      "steps": [
        "Ôn lại các từ chưa phục hồi trong session này.",
        "Kết thúc bằng câu điền từ không có lựa chọn."
      ]
    },
    "practicePlan": {
      "recommendedItemCount": 4,
      "focusDimensions": ["RECALL"],
      "questionTypes": ["SELECT_WORD", "FILL_BLANK"],
      "message": "Một lượt luyện ngắn sẽ củng cố các từ vừa sai."
    }
  },
  "progressComparison": {
    "baselineSessionCount": 5,
    "accuracy": {
      "current": 0.8,
      "previousAverage": 0.68,
      "delta": 0.12
    },
    "bySkill": []
  },
  "readingRecommendations": {
    "topics": [],
    "articles": []
  },
  "followUpReview": {
    "available": true,
    "weakVocabularyCount": 4
  }
}
```

Các field AI mới có thể nullable trong giai đoạn rollout để summary cũ vẫn đọc được.

### 3.5 Thời điểm tạo summary

Không để `GET summary` phát sinh AI call hoặc ghi database.

- Sau submit/skip cuối cùng, repository hoàn thành session trong transaction như hiện tại.
- Khi transaction đã commit, `ReviewsService` gọi `ReviewAgentService.ensureSessionSummary`.
- Hàm này gọi AI nếu còn budget và chỉ lưu output hợp lệ.
- `GET /summary` chỉ đọc kết quả. Với session cũ chưa có `SESSION_SUMMARY`, backend trả các field coaching ở trạng thái rỗng/null.

Cách này giữ GET là read-only, không cần background job và không làm mất summary khi provider lỗi. Đổi lại, request hoàn thành session có thể chậm thêm một AI call; cần dùng timeout ngắn và không để lỗi coaching làm thất bại kết quả ôn đã commit.

## 4. Task 1 — Phân tích tổng thể nguyên nhân thường sai

### Mục tiêu

Biến dữ liệu câu sai thành tối đa ba mẫu lỗi có bằng chứng, thay vì chỉ liệt kê từ sai.

### Backend

1. Mở rộng snapshot tổng kết trong `ReviewSessionsRepository` với dữ liệu có giới hạn:
   - kết quả session hiện tại;
   - tối đa năm session `COMPLETED` trước đó;
   - accuracy theo skill và question type;
   - số lần dùng hint, câu trả lời chậm và retest;
   - top `ReviewErrorType`;
   - tối đa năm từ yếu, dùng alias thay vì UUID khi gửi AI.
2. Thêm input/output contract vào AI module.
3. Mở rộng `ReviewAgentService` với `summarizeSession`; không tạo service agent thứ hai.
4. Validate chặt:
   - tối đa ba patterns;
   - enum phải thuộc evidence được cung cấp;
   - giới hạn độ dài headline/explanation/recommendation;
   - cấm extra keys và ID.
5. Nếu AI timeout, không khả dụng hoặc output không hợp lệ thì không tạo coaching giả lập.
6. Lưu kết quả hợp lệ bằng `ReviewDecisionKind.SESSION_SUMMARY`.

### Database

Không tạo bảng mới. Thêm một unique partial index cho một summary trên một session:

```text
UNIQUE (review_session_id, kind) WHERE kind = 'SESSION_SUMMARY'
```

Index này giúp retry hoặc hai request đồng thời không tạo hai summary.

### Frontend

Mở rộng `CompletedReviewResult` và thêm section “Vì sao bạn thường sai?” trên `ReviewSummaryPage`.

Mỗi pattern chỉ hiển thị:

- kỹ năng;
- dạng lỗi bằng ngôn ngữ dễ hiểu;
- giải thích;
- một hành động nên làm.

Không hiển thị provider, model, confidence hoặc prompt metadata.

### Test/tiêu chí hoàn thành

- Không có lịch sử vẫn trả summary hợp lệ.
- AI output sai enum/extra key/chuỗi quá dài bị từ chối và không được lưu.
- Một session chỉ có một `SESSION_SUMMARY`.
- AI không được gọi trong transaction.
- FE hiển thị 0–3 patterns và xử lý empty state.

## 5. Task 2 — Kế hoạch luyện tập cho buổi tiếp theo

### Mục tiêu

Đưa ra kế hoạch ngắn, có thể thực hiện, không phải lời khuyên chung chung.

### Backend

Kế hoạch là một phần của cùng `SESSION_SUMMARY` call ở Task 1:

- `reviewGoal`: một giá trị `ReviewGoal` hiện có;
- `targetDurationMinutes`: `5`, `10` hoặc `15`;
- tối đa ba `focusDimensions`;
- tối đa ba bước hành động ngắn.

Server clamp kết quả theo:

- `dailyStudyMinutes` của profile nếu có;
- skill/error evidence thực tế;
- các enum và thời lượng được phép.

Nếu AI không trả plan hợp lệ, summary chỉ hiển thị thống kê và không hiện CTA “Dùng kế hoạch này”.

### Frontend

Thêm card “Kế hoạch buổi tiếp theo”:

- mục tiêu;
- thời lượng;
- các bước;
- nút “Dùng kế hoạch này”.

Nút này mở Daily Review hiện có với `reviewGoal` và thời lượng được prefill. Chỉ mở rộng URL/search-param hiện có; không tạo trang planner mới.

### Test/tiêu chí hoàn thành

- Không nhận duration ngoài `5/10/15`.
- Không nhận focus skill không có trong allowed list.
- Link FE tạo đúng search params.
- Daily Review vẫn hoạt động khi không có kế hoạch AI.

## 6. Task 3 — Bài tập bổ sung được cá nhân hóa

### Quyết định tối giản

Không tạo model “Exercise”, question type mới hoặc màn hình bài tập riêng. Bài tập bổ sung là một `FOCUS_REVIEW` ngắn, tái sử dụng:

- `ReviewSession`;
- `ReviewSessionItem`;
- question generator/cache;
- grading, scoring, hints, retest và resume hiện có.

### Backend

1. AI chỉ đề xuất skill/question type và số lượng trong `practicePlan`; backend đọc proposal đã lưu, validate lại và tự chọn vocabulary.
2. Xếp hạng từ yếu:
   - sai và chưa phục hồi;
   - skipped hoặc sai lần retest;
   - lapse count cao;
   - sai nhưng đã phục hồi;
   - stable ID làm tie-breaker.
3. Giới hạn 3–5 từ, hoặc toàn bộ nếu session có ít hơn ba từ yếu.
4. Mở rộng `AiAssistedQuestionGeneratorService` để chuẩn bị câu hỏi cho tập vocabulary đã được backend xác thực.
5. Không áp daily due predicate cho Focus Review vì đây là lượt luyện chủ động ngay sau session.
6. Tạo một `ReviewSession` bình thường bằng flow hiện có. Không thêm `sessionMode` hoặc quan hệ `sourceSessionId` trong MVP; source session chỉ dùng để kiểm tra và chọn từ tại thời điểm tạo.

### Question type mapping mặc định

| Skill yếu | Question type ưu tiên |
| --- | --- |
| `RECOGNITION` | `SELECT_MEANING` |
| `RECALL` | `SELECT_WORD`, sau đó `FILL_BLANK` |
| `SPELLING` | `FILL_BLANK` |
| `CONTEXT` | `SELECT_CORRECT_CONTEXT` |
| `PRODUCTION` | Không dùng trong MVP |

AI có thể chọn trong danh sách allowed; backend vẫn kiểm tra cache/generation và fallback về mapping trên.

### Frontend

Không có UI bài tập mới. Sau khi tạo Focus Review, điều hướng vào `ReviewPage` hiện có.

### Test/tiêu chí hoàn thành

- Không nhận vocabulary IDs từ client.
- Chỉ chọn từ thuộc user và source session đã hoàn thành.
- Không chọn từ không yếu.
- Không tạo quá năm item.
- Provider failure không tạo câu hỏi thay thế; chỉ dùng cache AI hoặc Gemini/Groq như hiện tại.
- Session tạo xong vẫn grading, resume, complete và xuất hiện trong history như session hiện tại.

## 7. Task 4 — Gợi ý bài viết/chủ đề nên đọc

### Quyết định tối giản

Article recommendation do backend chọn từ dữ liệu thật; AI không được tạo article title, slug hoặc URL.

Không dùng embedding hoặc vector search trong giai đoạn này.

### Backend

1. Từ các vocabulary yếu, lấy:
   - category của source article;
   - `vocabularyTopic` nếu có;
   - CEFR hiện tại của user.
2. Mở rộng `ArticlesRepository`/`ArticlesService` bằng một query bounded:
   - chỉ `PUBLISHED`;
   - ưu tiên category xuất hiện nhiều trong từ yếu;
   - ưu tiên CEFR bằng level hiện tại;
   - loại source articles của session;
   - loại articles user đã `COMPLETED`;
   - sắp xếp `publishedAt desc`, `id asc`;
   - tối đa ba articles.
3. `ReviewsModule` import `ArticlesModule`; dùng `ArticlesService` đã được export.
4. Trả article card thật: `title`, `slug`, `summary`, `thumbnailUrl`, `cefrLevel`, `category`.
5. Lý do đề xuất dùng reason code, ví dụ `MATCHES_WEAK_CATEGORY`, để FE dịch bằng i18n.

Nếu không có article phù hợp, chỉ trả topic/category; không bịa bài viết.

### Frontend

Thêm section “Đọc tiếp để củng cố” trên summary:

- tối đa ba card gọn;
- link dùng `readerPath(slug)` hiện có;
- hiển thị category, CEFR và lý do;
- không fetch thêm từng article trong loop.

### Test/tiêu chí hoàn thành

- Không trả draft/archived/completed/source article.
- Kết quả có giới hạn và thứ tự ổn định.
- Slug luôn đến từ database.
- FE link sang article reader đúng route.
- Empty state không chiếm nhiều diện tích.

## 8. Task 5 — So sánh tiến bộ với các lần ôn trước

### Mục tiêu MVP

So sánh current session với trung bình tối đa năm session `COMPLETED` ngay trước nó.

### Backend

1. Query một lần, bounded `take: 5`, có ownership scope.
2. Với mỗi item của session cũ, chỉ dùng attempt cuối cùng giống logic result hiện tại.
3. Tính deterministic:
   - current accuracy;
   - previous average accuracy;
   - delta;
   - accuracy/delta theo skill khi có evidence;
   - `baselineSessionCount`.
   `previousAverage` được tính bằng tổng số item đúng / tổng số item của baseline, không lấy trung bình đơn giản của năm tỷ lệ. Nhờ đó session 5 câu không có trọng số ngang session 20 câu. Item skipped vẫn nằm trong mẫu số, giống `calculateAggregates` hiện tại.
4. Nếu chưa có session trước:
   - `baselineSessionCount = 0`;
   - `previousAverage` và `delta` là `null`;
   - không dùng câu “tăng/giảm”.
5. Dữ liệu này được đưa vào AI snapshot của Task 1 nhưng con số trả về cho FE luôn do backend tính.

Không gọi analytics endpoint từ FE để ghép dữ liệu và không tạo chart trend mới trong MVP.

### Frontend

Hiển thị một comparison card nhỏ:

- accuracy hiện tại;
- trung bình trước đó;
- tăng/giảm theo percentage points;
- tối đa ba skill có evidence.

Màu không phải tín hiệu duy nhất; luôn có text “tăng”, “giảm” hoặc “chưa đủ dữ liệu”.

### Test/tiêu chí hoàn thành

- Không có baseline, một baseline và năm baseline.
- Session của user khác không được tính.
- Không chia cho 0.
- Delta dùng percentage points và làm tròn nhất quán.
- FE không diễn giải `null` thành 0%.

## 9. Task 6 — Nút ôn riêng các từ yếu

Task này là entry point của Task 3, không phải một hệ thống khác.

### API đề xuất

```text
POST /api/v1/review-sessions/:sessionId/follow-up
```

Body chỉ chứa setting an toàn, ví dụ:

```json
{
  "preparationId": "uuid",
  "targetDurationMinutes": 5,
  "reviewGoal": "RECALL"
}
```

Không nhận `userVocabularyIds`. Backend tự đọc source session và xác định từ yếu.

### Backend

1. Xác thực source session:
   - thuộc user;
   - `COMPLETED`;
   - có ít nhất một từ yếu còn tồn tại.
2. Nếu user đang có active session khác, trả `409`; không âm thầm resume session không liên quan.
3. Chuẩn bị câu hỏi ngoài transaction.
4. Trong transaction, kiểm tra lại ownership, source evidence và active-session invariant rồi tạo `FOCUS_REVIEW`.
5. Trả `ReviewSessionState` hiện có để FE tái sử dụng toàn bộ flow.

### Frontend

1. Thêm `reviewsApi.startFollowUp`.
2. Thêm mutation trong `useReviews.ts` và cập nhật cùng query cache như start session hiện tại.
3. Trên summary:
   - hiện nút khi `followUpReview.available = true`;
   - loading/disabled state;
   - điều hướng tới `reviewSessionPath(newSession.id)`;
   - xử lý `409` bằng link resume active session;
   - xử lý không còn vocabulary bằng thông báo nhẹ và refetch summary.
4. Sau khi hoàn thành Focus Review, vẫn dùng summary page hiện có.

### Test/tiêu chí hoàn thành

- Ownership, source status và active-session conflict.
- Double click không tạo hai active sessions.
- Không có weak words thì CTA bị ẩn/disabled và API từ chối an toàn.
- Mutation cập nhật `active`, `session`, `history`, `today`, vocabulary và analytics keys đúng phạm vi.
- Flow hoạt động sau refresh.

## 10. Task 7 — Coaching đúng ngôn ngữ giao diện

### Nguồn ngôn ngữ

Dùng `UserProfile.preferredLanguage`, vì FE đã đồng bộ i18next từ field này. Không thêm locale state thứ hai và không tin locale tùy ý từ request body.

MVP hỗ trợ `vi` và `en`; giá trị khác fallback về `vi` theo policy hiện tại của ứng dụng.

### Backend

1. Thêm `locale` vào summary snapshot và AI input.
2. Prompt yêu cầu tất cả learner-facing text dùng đúng locale.
3. AI output phải echo đúng locale trong allowed list.
4. Output sai locale bị từ chối, không ghép nội dung thay thế ở backend.
5. Lưu `locale` trong `decisionPayload` để summary lịch sử có thể audit.
6. Không đưa translation sang FE để FE tự ghép lại nội dung AI.

Summary được lưu bằng ngôn ngữ profile tại thời điểm tạo. MVP không tự regenerate summary lịch sử khi user đổi language sau đó; chỉ các label tĩnh đổi theo i18next.

### Frontend

1. Thêm mọi label tĩnh vào:
   - `src/i18n/locales/vi/review.json`;
   - `src/i18n/locales/en/review.json`.
2. Render AI text bằng text node, không dùng HTML.
3. Không dịch lại AI text ở client.
4. Giới hạn/wrap chuỗi dài trên mobile.

### Test/tiêu chí hoàn thành

- Profile `vi` tạo summary tiếng Việt; profile `en` tạo summary tiếng Anh.
- Provider trả locale khác hoặc output không hợp lệ thì không lưu coaching.
- FE đổi language làm toàn bộ label tĩnh đổi đúng.
- Nội dung AI được escape và không render HTML/script.

## 11. Cách lưu SESSION_SUMMARY

Không thêm queue hoặc bảng trạng thái mới:

1. Sau khi session vừa chuyển sang `COMPLETED`, service kiểm tra ownership và AI budget.
2. AI được gọi ngoài transaction với timeout hiện có.
3. Chỉ output hợp lệ mới được ghi bằng nguồn `AI`.
4. Unique partial index bảo đảm database chỉ giữ một summary cho mỗi session.
5. Timeout/provider/validation lỗi thì bỏ qua coaching; kết quả review đã commit vẫn hợp lệ.

Không cần thêm `summary_status`, counter mới hoặc background worker cho MVP.

## 12. Thứ tự triển khai đề xuất

### PR 1 — Evidence và contract deterministic

- Task 5: progress comparison.
- Task 4: article/topic recommendation.
- Mở rộng summary DTO/type nhưng các field AI mới nullable.
- Unit tests cho query, ownership và empty states.

### PR 2 — AI SESSION_SUMMARY và locale

- Task 1, Task 2 và Task 7.
- AI contracts/schema/parser/service.
- `ReviewAgentService.summarizeSession`.
- unique partial index và persistence/fallback.
- Một AI call tối đa cho một session.

### PR 3 — Summary UI

- Render error analysis, next-session plan, comparison và articles.
- Bổ sung i18n, loading, empty/error states.
- Giữ layout trong `ReviewSummaryPage` trước; chỉ tách component khi file trở nên khó đọc hoặc section được tái sử dụng.

### PR 4 — Focus Review backend

- Task 3 và phần API của Task 6.
- Explicit weak-vocabulary selection và question preparation.
- E2E ownership/concurrency.

### PR 5 — Focus Review CTA

- Mutation/cache/navigation.
- CTA, `409` recovery và UI tests.

Mỗi PR phải chạy độc lập; không yêu cầu merge toàn bộ năm PR mới giữ được review flow hiện tại.

## 13. Files dự kiến thay đổi

### Backend

- `prisma/models/reviews.prisma`
- migration mới cho unique summary index
- `src/modules/ai/ai.contracts.ts`
- `src/modules/ai/ai.schemas.ts`
- `src/modules/ai/validation/review.validation.ts`
- `src/modules/ai/services/ai.service.ts`
- `src/modules/reviews/reviews.module.ts`
- `src/modules/reviews/controllers/review-sessions.controller.ts`
- `src/modules/reviews/dto/review-request.dto.ts`
- `src/modules/reviews/dto/review-response.dto.ts`
- `src/modules/reviews/repositories/review-agent.repository.ts`
- `src/modules/reviews/repositories/review-questions.repository.ts`
- `src/modules/reviews/repositories/review-sessions.repository.ts`
- `src/modules/reviews/services/review-agent.service.ts`
- `src/modules/reviews/services/ai-assisted-question-generator.service.ts`
- `src/modules/reviews/services/reviews.service.ts`
- `src/modules/articles/repositories/articles.repository.ts`
- `src/modules/articles/services/articles.service.ts`
- các unit/E2E specs tương ứng

Không dự kiến tạo backend service/repository mới.

### Frontend

- `src/types/Review/review.ts`
- `src/api/Review/ReviewsApi.ts`
- `src/hooks/Review/useReviews.ts`
- `src/pages/Review/ReviewSummaryPage.tsx`
- `src/pages/Review/ReviewPage.tsx` chỉ khi cần tái sử dụng/cải thiện trạng thái preparation hiện có
- `src/utils/paths.ts`
- `src/i18n/locales/vi/review.json`
- `src/i18n/locales/en/review.json`
- `tests/review-ui.test.tsx`

Không tạo state store mới. Tiếp tục dùng TanStack Query cho server state và URL params cho setting có thể chia sẻ.

## 14. Test plan tổng thể

### Backend unit

- snapshot có giới hạn và không chứa dữ liệu cá nhân;
- progress comparison đúng attempt cuối;
- article selection đúng status/category/progress;
- AI parser từ chối extra keys, ID, enum lạ và text quá dài;
- AI timeout/429/invalid/low confidence không tạo coaching;
- summary claim idempotent;
- locale `vi`/`en`;
- Focus Review ranking và max item count;
- provider được mock và không chạy trong transaction.

### Backend E2E

- summary ownership, `404` và session chưa hoàn thành `409`;
- completed summary contract;
- hai request summary đồng thời chỉ có một decision;
- follow-up ownership, empty weak list, active conflict và thành công;
- không nhận client vocabulary IDs.

### Frontend

- các section render khi có dữ liệu và ẩn gọn khi trống;
- `null` comparison không hiển thị thành 0%;
- article links đúng route;
- locale labels;
- AI text được render an toàn;
- follow-up CTA loading/error/success/409 recovery;
- query cache không làm progress hoặc session state lùi lại.

### Lệnh kiểm tra

Backend:

```bash
npm test -- --runInBand
npm run prisma:format
npm run prisma:validate
npm run prisma:verify-review-migrations
npm run build
```

Frontend:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## 15. Non-goals

Không đưa vào scope này:

- chatbot sau session;
- multi-agent hoặc agent tự gọi tool/database;
- LangChain/LangGraph;
- queue/background worker;
- vector search/embedding;
- câu hỏi production/free-writing cần AI chấm;
- AI thay đổi score hoặc lịch spaced repetition;
- AI tạo article hoặc URL không tồn tại;
- dashboard analytics mới;
- lưu và báo cáo một loại session riêng cho Focus Review;
- lưu quan hệ lâu dài giữa Focus Review và source session;
- regenerate mọi summary cũ khi user đổi ngôn ngữ;
- notification/email nhắc học.

Các mục này chỉ được xem xét khi có yêu cầu và dữ liệu chứng minh nhu cầu.

## 16. Definition of done

- Summary hiện tại vẫn tương thích với session cũ.
- Mỗi completed session có tối đa một `SESSION_SUMMARY` được audit.
- Một session dùng tối đa một AI call cho coaching tổng kết.
- AI lỗi không làm mất kết quả ôn hoặc chặn trang summary.
- Phân tích lỗi và kế hoạch chỉ dựa trên evidence được backend cung cấp.
- Progress comparison và article IDs do backend tính/chọn, không do AI bịa.
- Coaching dùng `preferredLanguage` và FE dịch toàn bộ label tĩnh.
- Người học có thể bắt đầu Focus Review từ các từ yếu mà không gửi IDs từ client.
- Focus Review tái sử dụng review engine hiện tại và có thể resume.
- Không thêm dependency, framework hoặc service layer không cần thiết.
- Unit tests, relevant E2E, typecheck/lint/build đều pass.
