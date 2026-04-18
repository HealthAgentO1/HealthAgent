name: Bug
description: Report a bug or issue
labels: ["bug"]

body:
  - type: textarea
    attributes:
      label: Description
      description: What happened?
      placeholder: "The symptom flow crashes when entering special characters"
    validations:
      required: true

  - type: textarea
    attributes:
      label: Steps to Reproduce
      description: How do we reproduce it?
      placeholder: |
        1. Navigate to symptom input screen
        2. Enter "fever & chills"
        3. Click submit
    validations:
      required: true

  - type: textarea
    attributes:
      label: Expected Behavior
      description: What should happen?
      placeholder: "Form should accept special characters and submit"
    validations:
      required: true

  - type: textarea
    attributes:
      label: Actual Behavior
      description: What actually happened?
      placeholder: "Page crashes with 500 error"
    validations:
      required: true

  - type: textarea
    attributes:
      label: Error Log
      description: Any error messages or logs
      placeholder: "Paste error output here"

  - type: dropdown
    attributes:
      label: Severity
      options:
        - "Blocker (prevents demo)"
        - "High (breaks feature)"
        - "Medium (workaround exists)"
        - "Low (cosmetic)"
    validations:
      required: true