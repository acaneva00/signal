# Changelog: Pre-Login Onboarding

## 2024-02-10 - Initial Implementation

### Added

**API Route: `/api/onboarding/chat`**
- Unauthenticated chat endpoint for pre-login onboarding
- Session management via httpOnly cookies
- 5-question hardcoded flow (age, employment, income, super, goal)
- Rate limiting: 3 sessions per IP per hour
- Message limit: 20 messages per session
- Claude integration for goal acknowledgement and final projection

**Database**
- `pre_login_sessions` table for storing session data
- `check_session_rate_limit(ip)` RPC function
- `cleanup_expired_pre_login_sessions()` RPC function
- RLS policies for anonymous access
- 7-day TTL with cleanup function

**Types**
- Added `'free_text'` to `InputRequest.type` union type
- Supports both structured inputs and free text responses

**Utilities**
- `convertPreLoginSession()` helper for migrating session data to user accounts
- Band midpoint mappings for age, income, and super balance
- Age-based super balance estimation for "no idea" responses

**Documentation**
- Comprehensive guide: `docs/pre-login-onboarding.md`
- API route README: `src/app/api/onboarding/README.md`
- Conversion helper with inline comments

### Technical Details

**Session Cookie**
```
Name: pre_login_session_id
Type: httpOnly, secure (in production)
Max Age: 7 days
SameSite: lax
```

**Question Sequence**
1. age_range → single_select (6 options)
2. employment_type → single_select (5 options)
3. income_band → single_select (5 options)
4. super_balance_band → single_select (6 options)
5. goal_text → free_text (open input)

**Rate Limits**
- Sessions: 3 per IP per hour
- Messages: 20 per session

**Data Storage**
- Sessions stored in `pre_login_sessions.session_data` as JSONB
- No PII - only band/range values
- Automatic expiry after 7 days (unless converted)

**Conversion Flow**
When user signs up:
1. Financial profile created with band midpoints (confidence: 0.6)
2. Goal saved to goals table (status: 'active')
3. Session marked with `converted_to_user_id`
4. Session preserved indefinitely (exempt from TTL cleanup)

### Dependencies

- `@anthropic-ai/sdk`: ^0.74.0 (already installed)
- Environment variable: `ANTHROPIC_API_KEY`

### Migration Required

Run migration file: `supabase/migrations/00003_pre_login_sessions.sql`

```sql
-- Creates:
-- - pre_login_sessions table
-- - RLS policies
-- - Rate limiting function
-- - Cleanup function
-- - Indexes
```

### Future Enhancements

- [ ] Store conversation history in messages table with channel='pre_login'
- [ ] Analytics tracking for each step
- [ ] A/B testing different question orders
- [ ] Branching logic based on answers
- [ ] Multiple onboarding flows (investor vs saver vs retiree)
- [ ] SMS/WhatsApp channel support
- [ ] Progressive profiling (fewer initial questions, more over time)

### Breaking Changes

None - this is a new feature with no impact on existing functionality.

### Migration Steps

1. Run database migration: `00003_pre_login_sessions.sql`
2. Ensure `ANTHROPIC_API_KEY` is set in environment
3. Deploy API route
4. Update frontend to use new endpoint
5. Integrate conversion helper into signup flow

### Testing Checklist

- [ ] Create session without cookie → receives first question
- [ ] Submit answers → progresses through questions
- [ ] Complete all 5 questions → receives projection with CTA
- [ ] Rate limiting → 4th session from same IP fails
- [ ] Message limit → 21st message in session fails
- [ ] Session expiry → 7-day-old session is invalid
- [ ] Conversion → session data migrates to user account
- [ ] Cleanup function → removes expired unconverted sessions

### API Examples

**Start session:**
```bash
curl -X POST http://localhost:3000/api/onboarding/chat \
  -H "Content-Type: application/json" \
  -c cookies.txt
```

**Submit answer:**
```bash
curl -X POST http://localhost:3000/api/onboarding/chat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "content": "26–35",
    "structured_response": {
      "field": "age_range",
      "value": "26-35",
      "source": "structured_input",
      "confidence": 1.0
    }
  }'
```

**Check session state:**
```bash
curl -X GET http://localhost:3000/api/onboarding/chat \
  -b cookies.txt
```

### Monitoring

Recommended metrics:
- Sessions created per day/hour
- Completion rate (% reaching question 5)
- Conversion rate (% signing up after completion)
- Average time to complete onboarding
- Rate limit hits (429 responses)
- Question drop-off rates

### Security Notes

- Sessions use httpOnly cookies (no XSS risk)
- No PII stored in sessions (only bands/ranges)
- Rate limiting prevents abuse
- TTL cleanup prevents data accumulation
- IP addresses used only for rate limiting
- RLS policies restrict access appropriately

### Known Limitations

1. No conversation history persistence (messages not stored in DB)
2. Cannot resume onboarding after session expires
3. Fixed question order (no branching)
4. Single onboarding flow (no segmentation)
5. No analytics/tracking built in
6. Claude calls not cached (could be expensive)

### Performance Considerations

- Each completion requires 2 Claude API calls:
  - Goal acknowledgement (~$0.003)
  - Final projection (~$0.015)
  - Total per user: ~$0.02
- Session lookups use indexed queries
- Rate limit checks use indexed queries
- No N+1 query issues

### Cost Estimates

**Per 1000 completed onboardings:**
- Claude API: ~$20 (2 calls × $0.01 per call × 1000)
- Database: negligible (Supabase free tier covers this easily)
- Storage: ~1MB (1KB per session × 1000)

**Monthly (10,000 completions):**
- Claude API: ~$200
- Database operations: included in Supabase plan
- Total: ~$200/month

---

## Implementation Notes

### Key Design Decisions

1. **Hardcoded questions**: Ensures consistent experience, no LLM hallucinations
2. **Band-based inputs**: Reduces friction, improves privacy
3. **Session cookies**: Standard web pattern, works across page refreshes
4. **Rate limiting at session creation**: Prevents IP-based abuse
5. **Claude only for goals**: Keeps costs reasonable while adding personalization
6. **7-day TTL**: Balance between usability and data retention

### Alternative Approaches Considered

1. **LocalStorage instead of cookies**
   - ❌ Rejected: Can't be accessed server-side, less secure
   
2. **LLM-generated questions**
   - ❌ Rejected: Too expensive, unpredictable, could hallucinate
   
3. **Exact values instead of bands**
   - ❌ Rejected: Higher friction, privacy concerns
   
4. **Auth-required from start**
   - ❌ Rejected: Increases drop-off, defeats purpose of pre-login

5. **Store messages in DB**
   - ⏸️ Deferred: Adds complexity, not needed for MVP

### Code Organization

```
src/
  app/api/onboarding/
    chat/
      route.ts              # Main API route
    README.md               # Quick reference
  lib/onboarding/
    conversion.ts           # Session → User conversion
  types/
    agent.ts                # Type definitions

supabase/migrations/
  00003_pre_login_sessions.sql  # Database schema

docs/
  pre-login-onboarding.md       # Full documentation
  CHANGELOG_pre_login_onboarding.md  # This file
```

### Rollback Plan

If issues arise after deployment:

1. **Disable API route**: Comment out route exports
2. **Revert migration**: Run rollback SQL (if needed)
3. **Clear cookies**: Issue `Set-Cookie` with expired date
4. **Restore previous flow**: Fall back to original signup

Rollback SQL (if needed):
```sql
DROP FUNCTION IF EXISTS public.cleanup_expired_pre_login_sessions();
DROP FUNCTION IF EXISTS public.check_session_rate_limit(TEXT);
DROP TABLE IF EXISTS public.pre_login_sessions CASCADE;
```
