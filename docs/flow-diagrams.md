# Two-Round Question System - Visual Flow Diagrams

## Overall Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  USER STARTS ASSESSMENT                                     │
│  - Enters symptom description                               │
│  - Selects insurance provider                               │
│  - Optionally provides additional context                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  POST /symptom-check/start/│
        └────────────────┬───────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │ LLM ANALYZES INITIAL SYMPTOMS          │
    │ - Summarizes symptoms                  │
    │ - Generates possible conditions        │
    │ - Assesses confidence                  │
    │ - Determines: needs_followup?          │
    └─────────────┬────────────┬─────────────┘
                  │            │
        ┌─────────┘            └──────────┐
        │                                  │
        ▼ (true)                          ▼ (false)
    ╔════════════╗                    ╔════════════╗
    ║ SHOW INIT  ║                    ║  SKIP TO   ║
    ║ ASSESSMENT ║                    ║  FINALIZE  ║
    ║ + PROCEED  ║                    ╚─────┬──────┘
    ║  BUTTON    ║                          │
    ╚─────┬──────╝                          │
          │                                 │
          ▼                                 │
    ┌──────────────────────────────┐       │
    │ USER CLICKS "CONTINUE"       │       │
    └──────────────┬───────────────┘       │
                   │                       │
                   ▼                       │
    ┌─────────────────────────────────────┐
    │ POST /symptom-check/<id>/followup/  │
    └──────────────┬──────────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────────────┐
    │ LLM GENERATES FOLLOW-UP QUESTIONS       │
    │ - Targets differentiating features      │
    │ - Probes for red flags                  │
    │ - Creates 2-4 specific questions        │
    │ - Assesses: should_proceed_to_results?  │
    └─────────────┬────────────┬──────────────┘
                  │            │
        ┌─────────┘            └──────────┐
        │                                  │
        ▼ (false)                         ▼ (true)
    ╔═════════════════╗             ╔═════════════╗
    ║ SHOW FOLLOW-UP  ║             ║   SKIP TO   ║
    ║  QUESTIONS      ║             ║  FINALIZE   ║
    ║ (w/ answer form)║             ╚─────┬───────┘
    ╚────────┬────────╝                   │
             │                           │
             ▼                           │
    ┌────────────────────┐               │
    │ USER ANSWERS       │               │
    │ ALL QUESTIONS      │               │
    └────────┬───────────┘               │
             │                           │
             ▼                           │
    ┌─────────────────────────────────┐  │
    │ POST /symptom-check/<id>/       │  │
    │ finalize/ (with answers)        │  │
    └────────────┬────────────────────┘  │
                 │                       │
                 └───────────┬───────────┘
                             │
                             ▼
            ┌──────────────────────────────────┐
            │ LLM GENERATES FINAL ASSESSMENT   │
            │ - Refines condition list         │
            │ - Assigns triage level           │
            │ - Provides key findings          │
            │ - Recommends next steps          │
            └────────────┬─────────────────────┘
                         │
                         ▼
            ┌──────────────────────────────────┐
            │ DISPLAY COMPREHENSIVE RESULTS    │
            │ - Triage level banner            │
            │ - Possible conditions            │
            │ - Key findings                   │
            │ - Nearby hospitals               │
            │ - Cost estimates                 │
            └──────────────────────────────────┘
```

## Decision Tree

```
START: User submits symptoms
      │
      └─► Initial Assessment
          │
          ├─ needs_followup = TRUE?
          │  │
          │  ├─ YES ──► Show Initial Assessment Summary
          │  │          │
          │  │          └─► User clicks "Continue"
          │  │              │
          │  │              └─► Generate Follow-up Questions
          │  │                  │
          │  │                  └─► should_proceed_to_results?
          │  │                      │
          │  │                      ├─ YES ──► Finalize (skip Q answers)
          │  │                      │
          │  │                      └─ NO ──► Show Questions to User
          │  │                               │
          │  │                               └─► User Answers
          │  │                                   │
          │  │                                   └─► Finalize (with answers)
          │  │
          │  └─ NO ──► Finalize (no follow-up needed)
          │
          └─► Final Assessment
              │
              └─► Show Results
```

## Component State Diagram

```
SymptomCheckPage State Transitions

                    INTAKE
                     │ │
                     │ │ handleStartAssessment()
                     │ │
        ┌────────────┘ │
        │              │
        │   Error      ├─► INITIAL_QUESTIONS
        │              │              │
        │              │ handleRequestFollowup()
        │              │              │
        │              │   ┌──────────┴──────────┐
        │              │   │                     │
        │              │   ▼ (skip to results)   ▼ (show Q's)
        │              │ RESULTS               FOLLOWUP
        │              │   ▲                     │
        │              │   │ handleFinalize()    │
        │              │   │ handleFinalizeDir   │
        │              │   │                     │
        │              │   └─────────────────────┘
        │              │        (user submits)
        │              │
        └──────────────┴─► restart() returns to INTAKE
```

## Data Flow Through API

```
Frontend                          Backend                    LLM

User Input
├─ symptoms
├─ insurance
└─ optional details
        │
        ▼ POST /symptom-check/start/
        │                                 ┌─────────────────┐
        │                                 │ Assess Initial  │
        │                                 │ Symptoms        │
        │                                 │ (analyze)       │
        │                                 └────────┬────────┘
        │                                          │
        │◄─────────────────────────────────────────┤ JSON Response
        │ InitialAssessment object                 │
        │ + session_id                             │
        │ + needs_followup flag                    │
        │
        ├─ if (needs_followup == true)
        │  │
        │  ▼ POST /symptom-check/<id>/followup/
        │                                 ┌──────────────────┐
        │                                 │ Generate Targeted│
        │                                 │ Questions (LLM)  │
        │                                 └────────┬─────────┘
        │                                          │
        │◄─────────────────────────────────────────┤ JSON Response
        │ FollowupQuestionResponse object          │
        │ + questions array                        │
        │ + should_proceed_to_results flag         │
        │
        ├─ if (should_proceed_to_results == false)
        │  │
        │  ├─ Show Questions
        │  │ User Answers
        │  │
        │  ▼ POST /symptom-check/<id>/finalize/ (with answers)
        │  else if (should_proceed_to_results == true)
        │  │
        │  ▼ POST /symptom-check/<id>/finalize/ (no answers)
        │
        │                                 ┌──────────────────┐
        │                                 │ Final Assessment │
        │                                 │ (consolidate)    │
        │                                 └────────┬─────────┘
        │                                          │
        │◄─────────────────────────────────────────┤ JSON Response
        │ FinalAssessment object                   │
        │ + triage_level                           │
        │ + possible_conditions[]                  │
        │ + key_findings[]                         │
        │ + recommendations[]                      │
        │
        ▼ Display Results to User
```

## Question Type Rendering

```
Multiple Choice Question:
┌────────────────────────────────┐
│ Where is the pain located?     │
├────────────────────────────────┤
│ ◯ Upper abdomen                │
│ ◯ Lower left                   │
│ ◉ Lower right                  │ ◄─ Selected
│ ◯ Center abdomen               │
└────────────────────────────────┘


Yes/No Question:
┌────────────────────────────────┐
│ Do you have a fever?           │
├────────────────────────────────┤
│ [YES]   [NO]                   │
│  ◉      ○                      │ ◄─ Selected
└────────────────────────────────┘


Scale Question (1-10):
┌────────────────────────────────┐
│ Pain severity (1-10)?          │
├────────────────────────────────┤
│ 1 2 3 4 5 6 7 8 9 10           │
│         |●|                    │ ◄─ Current: 5
│ Mild  Moderate  Severe         │
└────────────────────────────────┘


Text Input Question:
┌────────────────────────────────┐
│ When did symptoms start?       │
├────────────────────────────────┤
│ [Two days ago________________] │
└────────────────────────────────┘
```

## Triage Level Workflow

```
LLM Analysis
    │
    ├─ Detects life-threatening symptoms?
    │  │
    │  ├─ YES (chest pain, severe bleeding, etc.)
    │  │  └──► EMERGENCY ◄─ RED BANNER
    │  │       "Call 911 or visit ER immediately"
    │  │
    │  └─ NO (continue analysis)
    │
    ├─ Detects symptoms requiring urgent care?
    │  │
    │  ├─ YES (moderate pain, concerning patterns, etc.)
    │  │  └──► URGENT ◄─ ORANGE BANNER
    │  │       "Seek evaluation within hours"
    │  │
    │  └─ NO (continue analysis)
    │
    └─ Default to routine care
       └──► ROUTINE ◄─ BLUE BANNER
            "Schedule with provider in days/weeks"
```

## Error Handling Flow

```
API Call
    │
    ├─ Network Error?
    │  ├─ YES ──► Show: "Connection failed, try again"
    │  └─ NO
    │
    ├─ Timeout?
    │  ├─ YES ──► Show: "Request taking too long"
    │  └─ NO
    │
    ├─ Invalid Response?
    │  ├─ YES ──► Validate Fields
    │  │          ├─ Missing required field?
    │  │          │  ├─ YES ──► Log error, use fallback
    │  │          │  └─ NO
    │  │          ├─ Invalid type?
    │  │          │  ├─ YES ──► Log error, use default
    │  │          │  └─ NO
    │  │          └─► Response valid, proceed
    │  └─ NO ──► Response valid, proceed
    │
    ├─ Validation Failed?
    │  ├─ YES ──► Show user-friendly error message
    │  │          "Unable to process response"
    │  │          [Try Again] [Start Over]
    │  └─ NO ──► Success! Display data
    │
    └─► User can restart at any point
```

## State Machine

```
States:
┌──────────┐
│  INTAKE  │◄──────────┐
└────┬─────┘           │
     │                 │
     ├─ User starts    │
     │   assessment    │
     │                 │
     ▼                 │
┌──────────────────┐   │
│ INITIAL_QUESTIONS│   │
└────┬─────────────┘   │
     │                 │
     ├─ LLM decides    │
     │                 │
     ├─ Show initial   │
     │   assessment    │
     │                 │
     ▼                 │
┌──────────┐           │
│ FOLLOWUP │           │
└────┬─────┘           │
     │                 │
     ├─ User answers   │
     │   questions     │
     │                 │
     ▼                 │
┌──────────┐           │
│ RESULTS  │           │
└──────────┘───────────┘
             Restart
```

## Summary Table

| Phase | Component | Input | LLM Action | Output | Decision |
|-------|-----------|-------|-----------|--------|----------|
| 1 | Intake Form | Symptoms + Insurance | Analyze | Assessment + needs_followup | True/False |
| 2a | Init Assessment | (none) | (none) | Display summary | Proceed |
| 2b | Followup Gen | (empty) | Generate Qs | Questions + should_proceed | True/False |
| 3 | Questions | User Answers | (none) | (record) | Submit |
| 4 | Finalize | Answers | Final Analysis | Triage + Conditions | Display |
| 5 | Results | (none) | (none) | Full Assessment | Restart |
