name: Task
description: Create a task for a feature or fix
labels: ["task"]

body:
  - type: textarea
    attributes:
      label: Description
      description: What needs to be done?
      placeholder: "e.g. Implement Infermedica triage scoring"
    validations:
      required: true

  - type: textarea
    attributes:
      label: Acceptance Criteria
      description: What does done look like?
      placeholder: |
        - [ ] Triage endpoint returns urgency level
        - [ ] Handles network errors gracefully
        - [ ] Logs all API calls
    validations:
      required: true

  - type: dropdown
    attributes:
      label: Story Points
      options:
        - "1"
        - "2"
        - "3"
        - "5"
        - "8"
        - "13"
    validations:
      required: true

  - type: dropdown
    attributes:
      label: Related Feature
      options:
        - "Feature 1: Symptom-to-Care"
        - "Feature 2: Medication Safety"
        - "Feature 3: Integration"
        - "Phase 4: Demo Prep"
        - "Setup"
    validations:
      required: false

  - type: textarea
    attributes:
      label: Notes
      description: Any additional context
      placeholder: "Links to APIs, design docs, or dependencies"