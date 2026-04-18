import os
import json
import logging
from typing import Dict, List, Any, Optional
from django.conf import settings
import openai

logger = logging.getLogger(__name__)

class SymptomLLMService:
    """
    Service for handling AI-powered symptom assessment and triage.
    """

    def __init__(self):
        # Use Deepseek API (OpenAI-compatible)
        api_key = settings.DEEPSEEK_API_KEY
        base_url = settings.DEEPSEEK_API_BASE
        model = getattr(settings, 'DEEPSEEK_MODEL', 'deepseek-chat')
        
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.model = model

    def assess_initial_symptoms(self, symptoms: str) -> Dict[str, Any]:
        """
        Perform initial assessment of symptoms and determine if followup is needed.
        """
        try:
            system_prompt = self._load_system_prompt()

            user_prompt = f"""
Please assess the following symptoms and provide an initial analysis:

SYMPTOMS: {symptoms}

Please provide:
1. A brief summary of the symptoms
2. Initial list of possible conditions (3-5 most likely)
3. Whether additional questions would help narrow down the diagnosis
4. If followup questions are needed, suggest what areas to explore

Respond in JSON format with this structure:
{{
    "summary": "brief summary",
    "possible_conditions": ["condition1", "condition2", "condition3"],
    "needs_followup": true/false,
    "followup_areas": ["area1", "area2"] (only if needs_followup is true),
    "confidence_level": "high/medium/low"
}}
"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )

            result_text = response.choices[0].message.content.strip()
            result = json.loads(result_text)

            # Validate the response structure
            required_keys = ['summary', 'possible_conditions', 'needs_followup', 'confidence_level']
            for key in required_keys:
                if key not in result:
                    raise ValueError(f"Missing required key: {key}")

            return result

        except Exception as e:
            logger.error(f"Error in assess_initial_symptoms: {str(e)}")
            return {
                "summary": "Unable to analyze symptoms at this time",
                "possible_conditions": ["General medical evaluation needed"],
                "needs_followup": False,
                "confidence_level": "low",
                "error": str(e)
            }

    def generate_followup_questions(self, conversation_log: List[Dict], answers: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate targeted followup questions based on initial assessment and user answers.
        """
        try:
            system_prompt = self._load_system_prompt()

            # Extract initial assessment from conversation log
            initial_assessment = None
            for entry in conversation_log:
                if entry.get('type') == 'initial_assessment':
                    initial_assessment = entry.get('assessment')
                    break

            if not initial_assessment:
                return {
                    "questions": [],
                    "reasoning": "No initial assessment found",
                    "should_proceed_to_results": True
                }

            user_prompt = f"""
Based on the initial assessment and user's answers, generate targeted followup questions to narrow down the diagnosis.

INITIAL ASSESSMENT:
{json.dumps(initial_assessment, indent=2)}

USER ANSWERS:
{json.dumps(answers, indent=2)}

Please generate 2-4 specific questions that would help differentiate between the possible conditions. These questions should be designed to gather information that will help narrow down the diagnosis significantly.

Respond in JSON format:
{{
    "questions": [
        {{
            "id": "question_id",
            "question": "Specific question text",
            "type": "multiple_choice|yes_no|scale|text",
            "options": ["option1", "option2"] (for multiple_choice),
            "purpose": "brief explanation of why this question helps"
        }}
    ],
    "reasoning": "why these specific questions were chosen",
    "expected_impact": "how answers will help narrow diagnosis",
    "should_proceed_to_results": false (always false for followup)
}}
"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1500
            )

            result_text = response.choices[0].message.content.strip()
            result = json.loads(result_text)

            # Validate response
            if 'questions' not in result:
                raise ValueError("Missing questions in response")

            return result

        except Exception as e:
            logger.error(f"Error in generate_followup_questions: {str(e)}")
            return {
                "questions": [],
                "reasoning": "Unable to generate followup questions",
                "should_proceed_to_results": True,
                "error": str(e)
            }

    def generate_final_assessment(self, conversation_log: List[Dict], final_answers: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate final assessment based on all collected information.
        """
        try:
            system_prompt = self._load_system_prompt()

            user_prompt = f"""
Based on the complete conversation and all answers, provide a final symptom assessment and triage recommendation.

CONVERSATION LOG:
{json.dumps(conversation_log, indent=2)}

FINAL ANSWERS:
{json.dumps(final_answers, indent=2)}

Please provide a comprehensive assessment including:
1. Refined list of possible conditions with likelihood
2. Triage level (emergency/urgent/routine)
3. Key findings that influenced the assessment
4. Recommended next steps

Respond in JSON format:
{{
    "triage_level": "emergency|urgent|routine",
    "possible_conditions": [
        {{
            "condition": "condition name",
            "likelihood": "high|medium|low",
            "explanation": "why this is considered"
        }}
    ],
    "key_findings": ["finding1", "finding2"],
    "recommendations": ["recommendation1", "recommendation2"],
    "differential_diagnosis": "brief explanation of reasoning",
    "urgency_explanation": "why this triage level was chosen"
}}
"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=2000
            )

            result_text = response.choices[0].message.content.strip()
            result = json.loads(result_text)

            # Validate response
            required_keys = ['triage_level', 'possible_conditions', 'key_findings', 'recommendations']
            for key in required_keys:
                if key not in result:
                    raise ValueError(f"Missing required key: {key}")

            return result

        except Exception as e:
            logger.error(f"Error in generate_final_assessment: {str(e)}")
            return {
                "triage_level": "routine",
                "possible_conditions": [{
                    "condition": "General medical evaluation needed",
                    "likelihood": "medium",
                    "explanation": "Unable to complete assessment"
                }],
                "key_findings": ["Assessment incomplete"],
                "recommendations": ["Consult healthcare provider"],
                "differential_diagnosis": "Unable to complete analysis",
                "urgency_explanation": "Default triage level assigned",
                "error": str(e)
            }

    def _load_system_prompt(self) -> str:
        """
        Load the system prompt for symptom assessment.
        """
        prompt_path = os.path.join(settings.BASE_DIR, 'api', 'prompts', 'symptom_chat_system.txt')
        try:
            with open(prompt_path, 'r') as f:
                return f.read().strip()
        except FileNotFoundError:
            # Fallback system prompt
            return """
You are an expert medical AI assistant specializing in symptom assessment and triage.
Your role is to help users understand their symptoms and determine appropriate next steps.

IMPORTANT GUIDELINES:
- Always emphasize that you are not a substitute for professional medical care
- Never provide definitive diagnoses
- Focus on symptom patterns and triage urgency
- Be conservative with urgency assessments
- Use clear, understandable language
- Base recommendations on established medical knowledge

TRIAGE LEVELS:
- EMERGENCY: Immediate threat to life, severe symptoms requiring immediate care
- URGENT: Symptoms requiring care within hours
- ROUTINE: Symptoms that can be addressed in days/weeks

Always structure your responses appropriately for the requested analysis type.
"""</content>
<parameter name="filePath">c:\Users\peter\Downloads\gtstuff\HealthAgent\api\services\symptom_llm.py