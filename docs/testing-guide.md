# Testing Guide for Two-Round Question System

## Setup Requirements

### Backend Setup
1. Ensure PostgreSQL is running
2. Create/migrate database: `python manage.py migrate`
3. Set environment variables:
   ```
   OPENAI_API_KEY=sk-...your-key...
   OPENAI_MODEL=gpt-4
   ```
4. Start Django server: `python manage.py runserver`

### Frontend Setup
1. Install dependencies: `npm install` (if not already done)
2. Start dev server: `npm run dev`
3. Navigate to http://localhost:5173

## Test Scenarios

### Test 1: Clear Diagnosis (Skip Follow-up)
**Input:**
- Symptoms: "Sudden severe sharp chest pain radiating down my left arm, shortness of breath, sweating"
- Insurance: Select any option

**Expected Behavior:**
1. Initial assessment loads
2. AI identifies this as emergency with possible cardiac causes
3. Since diagnosis is clear, `needs_followup` should be `false`
4. Should skip directly to results without asking follow-up questions
5. Results should show Emergency triage level

**Assertion Points:**
- ✓ No follow-up questions displayed
- ✓ Emergency triage level shown
- ✓ Recommendations for emergency care included

---

### Test 2: Ambiguous Diagnosis (With Follow-up)
**Input:**
- Symptoms: "Stomach pain and nausea for 2 days"
- Insurance: Select any option

**Expected Behavior:**
1. Initial assessment loads
2. AI identifies multiple possible causes (gastroenteritis, appendicitis, food poisoning, etc.)
3. Since diagnosis is broad, `needs_followup` should be `true`
4. Move to follow-up step with 2-4 questions
5. Questions should differentiate between conditions

**Expected Questions:**
- Where exactly is the pain? (multiple choice)
- Have you had fever? (yes/no)
- Do you have diarrhea/vomiting? (yes/no)
- When did this start? (multiple choice or text)

**Assertion Points:**
- ✓ Follow-up questions displayed
- ✓ Questions are relevant to symptoms
- ✓ Different question types are used

---

### Test 3: Complete Flow with Answers
**Input:**
- Symptoms: "Pain in lower right abdomen, nausea"
- Insurance: Select any option
- Follow-up answers:
  - Location: Lower right
  - Fever: No
  - Vomiting: Mild
  - Duration: Since yesterday

**Expected Behavior:**
1. Initial assessment → Appendicitis suspected
2. Follow-up questions generated
3. User answers questions
4. Final assessment processes answers
5. Results show likely diagnosis and triage level

**Assertion Points:**
- ✓ Initial assessment displayed
- ✓ All follow-up questions rendered properly
- ✓ User can select/input answers
- ✓ Results reflect answer data
- ✓ Appendicitis appears in possible conditions

---

### Test 4: Question Type Rendering

#### Multiple Choice Question
```
Where is your pain located?
[O] Upper abdomen
[O] Lower left abdomen
[O] Lower right abdomen
[O] Center abdomen
```

**Test:**
- Click each option
- Verify selection is highlighted
- Verify answer is recorded

#### Yes/No Question
```
Do you have a fever?
[Yes] [No]
```

**Test:**
- Click each button
- Verify selection state changes
- Verify answer is recorded

#### Scale Question
```
How severe is your pain? (1-10)
[|------●--] 5
Mild  Moderate  Severe
```

**Test:**
- Drag slider to different values
- Verify number updates
- Verify answer is recorded

#### Text Question
```
Describe when the pain started:
[Text input field________]
```

**Test:**
- Type text
- Verify text is recorded
- Verify submit works

---

## Edge Cases to Test

### Edge Case 1: Error Handling - Invalid LLM Response
**Simulate:** Mock API to return malformed JSON
**Expected:** User sees error message, can restart assessment

### Edge Case 2: Network Timeout
**Simulate:** Slow/missing API connection
**Expected:** 
- Loading spinner appears
- Timeout message shown after delay
- User can restart

### Edge Case 3: Incomplete Follow-up Answers
**Simulate:** Skip some questions and try to submit
**Expected:**
- Incomplete questions can still submit
- Backend handles missing data gracefully
- Results still generated

### Edge Case 4: Back Button Navigation
**Test:**
- From initial questions, click "Start over"
- Verify state is reset
- Verify form is cleared
- Can start new assessment

### Edge Case 5: Insurance "Other" Option
**Input:**
- Select "Other (Enter manually)"
- Enter provider name
- Leave plan name empty
- Try to continue

**Expected:**
- Form validation prevents submission
- Error message shown
- Provider field is required

---

## Performance Tests

### Performance Test 1: First Response Time
**Measure:** Time from symptom submission to initial assessment display
**Expected:** < 5 seconds
**Tool:** Browser DevTools Network tab

### Performance Test 2: Follow-up Question Generation
**Measure:** Time from "Request Follow-up" to questions displayed
**Expected:** < 3 seconds
**Tool:** Browser DevTools Network tab

### Performance Test 3: Final Assessment
**Measure:** Time from submitting answers to results display
**Expected:** < 5 seconds
**Tool:** Browser DevTools Network tab

---

## Browser Compatibility Testing

Test on:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile browser

**Test Points:**
- [ ] Layout responsive on mobile
- [ ] Form inputs work on touch devices
- [ ] Buttons are clickable
- [ ] Text is readable

---

## Validation Testing

### Field Validation
**Test Symptom Input:**
- [ ] Empty submission blocked
- [ ] Very short symptoms (1-2 words) allowed
- [ ] Very long symptoms (1000+ chars) handled

**Test Insurance Selection:**
- [ ] Required field enforced
- [ ] Manual insurance requires provider name
- [ ] Can change insurance selection

### API Response Validation
**Verify each response has:**
- [ ] All required fields present
- [ ] Correct data types
- [ ] Valid enum values (for triage_level, question types)
- [ ] Non-empty collections when expected

---

## Manual Testing Checklist

### Initial Submission
- [ ] Symptom textarea accepts multiline input
- [ ] Insurance options are radio buttons (single select)
- [ ] "Other" option reveals manual input fields
- [ ] Disabled state when form invalid
- [ ] Loading indicator during submission

### Initial Assessment Display
- [ ] Assessment summary displayed
- [ ] List of possible conditions shown
- [ ] Follow-up decision is clear

### Follow-up Questions (if shown)
- [ ] Each question renders correctly
- [ ] Question purpose visible
- [ ] Answer options are distinct
- [ ] User can navigate questions
- [ ] Scroll position preserved

### Final Results
- [ ] Triage level banner displayed with appropriate color
- [ ] Possible conditions list shows likelihood
- [ ] Key findings are readable
- [ ] Hospital list shows distance
- [ ] Cost estimates display correctly

### State Management
- [ ] Step indicator shows correct current step
- [ ] Progress bar updates (if implemented)
- [ ] Back button returns to correct step
- [ ] Restart clears all data
- [ ] State persists on page refresh (if implemented)

---

## Debugging Tips

### Check Network Requests
1. Open DevTools (F12)
2. Go to Network tab
3. Look for API calls to `/symptom-check/...`
4. Check request/response payloads

### Check Console Errors
1. Open DevTools Console
2. Look for validation errors
3. Check for parsing failures
4. Verify LLM response structure

### Test with Mock Data
If API is slow:
1. Create mock handlers for API calls
2. Return sample valid responses
3. Test UI without backend delays

### Log State Changes
Add console logs in key functions:
```typescript
console.log('Initial Assessment:', initialAssessment);
console.log('Follow-up Answers:', followupAnswers);
console.log('Final Assessment:', finalAssessment);
```

---

## Automated Test Examples

### Example: E2E Test (Cypress/Playwright)
```javascript
describe('Two-Round Question System', () => {
  it('should complete flow with follow-up questions', () => {
    cy.visit('http://localhost:5173');
    
    // Fill intake form
    cy.get('[data-testid=symptoms-input]').type('Abdominal pain');
    cy.get('[data-testid=insurance-radio]:nth(0)').click();
    cy.get('button:contains("Continue")').click();
    
    // Wait for initial assessment
    cy.get('[data-testid=assessment-summary]').should('be.visible');
    
    // Request follow-up
    cy.get('button:contains("Continue to assessment")').click();
    
    // Answer follow-up questions
    cy.get('[data-testid=followup-questions]').should('have.length', 2);
    cy.get('[data-testid=question-0] input[value="Lower right"]').click();
    cy.get('[data-testid=question-1] input[value="Yes"]').click();
    
    // Submit
    cy.get('button:contains("See results")').click();
    
    // Verify results
    cy.get('[data-testid=triage-level]').should('contain', 'Urgent');
    cy.get('[data-testid=possible-conditions]').should('exist');
  });
});
```

---

## Success Criteria

✅ **Complete Implementation:**
- [x] Backend endpoints working
- [x] Frontend components rendering
- [x] Initial assessment flows through
- [x] Follow-up questions generation works
- [x] Final assessment completes
- [x] Results display correctly
- [x] Error handling in place
- [x] All question types supported
- [x] Smart skip logic functioning
- [x] Data validation complete

✅ **Ready for Production When:**
- All tests passing
- Error cases handled
- Performance acceptable
- Mobile responsive
- Accessibility standards met
- Documentation complete
