# Module 10 · Performance analytics

The `performance_snapshot` RPC aggregates owned interview data in PostgreSQL. It is `SECURITY INVOKER`, uses explicit owner scoping and inherits the caller's RLS. History and weakness evidence also remain owner-scoped. The frontend computes presentation heuristics from aggregate data. It does not download all underlying interviews and children for charts.

| Metric | Formula |
| --- | --- |
| Selection rate | 100 × selected ÷ (selected + rejected) |
| Rejection rate | 100 × rejected ÷ (selected + rejected) |
| First-round rejection rate | 100 × rejected first rounds ÷ known first-round outcomes |
| Round clearance | 100 × cleared ÷ (cleared + rejected), overall and by category |
| Weakness priority | 100 × (0.60 × category attempt frequency + 0.40 × mean severity ÷ 5) |
| Readiness | Weighted mean of clearance rates across eligible categories |
| Coverage | 100 × eligible weights ÷ configured weights |
| Performance change | Current percentage minus previous equivalent period percentage |

Rates return NULL for zero denominators. Pending and withdrawn decisions are excluded from overall rates. Pending and not-reached rounds are excluded from attempted outcomes and weakness analysis. Weakness frequency is occurrences divided by category attempts in the same interval and clamped to 1. Priority thresholds are Low below 40, Moderate from 40, High from 60 and Critical from 80. Predefined topics use IDs. Custom topics are grouped by category and normalized label. Recent topic counts use the last 30 calendar days ending at the selected end date or today's UTC date.

Readiness uses Aptitude 20, Coding 25, Technical 25, Group Discussion 15 and HR 15. A category must have at least three attempted rounds. MCQ, managerial, communication and Other remain separately visible. They are outside the initial weighting model because no preparation weights were assigned to them. Eligibility, weighting and sample sizes are transparent. This is a preparation estimate based on self-recorded outcomes, with no calibration to hiring probability.

Filters use inclusive interview calendar dates. Presets use UTC boundaries. Month labels group by interview date, including for associated weaknesses. Missing months between observations retain null rates. Previous windows have exactly the same inclusive day count and immediately precede the selected range. Weakness category, peak severity, priority and type select aggregate topic cards. Their detailed evidence retains the full history within the chosen date range.

An alternative is a private materialized aggregate refreshed after writes, with owner-aware access and an explicit staleness policy. Live aggregation avoids asynchronous inconsistency at current scale.

## Technical interview questions and answers

### 1. Why aggregate in PostgreSQL?

The database joins and counts owned data before transferring compact results to the browser.

### 2. What is count FILTER?

It counts rows meeting a condition without additional separate queries.

### 3. What does NULLIF do in a rate?

It converts a zero denominator to NULL so a missing rate stays unknown.

### 4. What is the completed decision denominator?

Selected plus rejected interviews.

### 5. What contributes to round clearance?

Only rounds with cleared or rejected outcomes.

### 6. How is first-round rejection different?

It uses a single known first-round outcome per interview as its denominator.

### 7. Can a cleared round include weakness reports?

Yes. A user may identify practice topics even after clearing a round.

### 8. How are custom topics grouped?

By normalized name within the round category.

### 9. How are predefined topics grouped?

By stable topic ID so unrelated names remain separate.

### 10. How is the priority score computed?

Frequency contributes 60 percent and average severity contributes 40 percent after normalization.

### 11. Why show priority evidence?

Counts, dates and examples show what supports a prioritization heuristic.

### 12. Which categories contribute to readiness?

Weighted configured categories with at least three attempted rounds.

### 13. What is weight renormalization?

Divide the weighted rate total by the sum of eligible weights.

### 14. What does coverage measure?

The fraction of configured weight covered by categories with enough observations.

### 15. Trap. Is 70 percent readiness a 70 percent hiring chance?

No. It estimates observed preparation evidence for a specific set of categories.

### 16. How is growth expressed?

Differences between percentages are reported in percentage points.

### 17. Why compare equivalent windows?

A preceding window of the same number of calendar days makes the comparison easier to interpret.

### 18. How are missing periods plotted?

They keep null performance rates so the chart can show gaps.

### 19. How are analytics access rules enforced?

The read RPC runs as the caller, applies RLS and limits the query to auth.uid().

### 20. When would a cached aggregate help?

When representative query plans show that live aggregation is too expensive at expected data volume.
