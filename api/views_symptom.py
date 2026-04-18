from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
import json
import logging
from .services.symptom_llm import SymptomLLMService
from .models import SymptomSession

logger = logging.getLogger(__name__)

@api_view(['POST'])
def start_symptom_check(request):
    """
    Start a symptom check session and get initial AI assessment.
    """
    try:
        symptoms = request.data.get('symptoms', '')
        insurance_details = request.data.get('insurance_details', {})

        if not symptoms.strip():
            return Response(
                {'error': 'Symptoms description is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create symptom session
        session = SymptomSession.objects.create(
            insurance_details=insurance_details,
            triage_level='pending'
        )

        # Initialize LLM service
        llm_service = SymptomLLMService()

        # Get initial assessment
        assessment = llm_service.assess_initial_symptoms(symptoms)

        # Store conversation in session
        session.ai_conversation_log = [{
            'type': 'initial_assessment',
            'symptoms': symptoms,
            'assessment': assessment,
            'timestamp': session.created_at.isoformat()
        }]
        session.save()

        return Response({
            'session_id': session.id,
            'assessment': assessment,
            'needs_followup': assessment.get('needs_followup', False)
        })

    except Exception as e:
        logger.error(f"Error in start_symptom_check: {str(e)}")
        return Response(
            {'error': 'Internal server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def followup_questions(request, session_id):
    """
    Get AI-generated followup questions to narrow down diagnosis.
    """
    try:
        answers = request.data.get('answers', {})

        try:
            session = SymptomSession.objects.get(id=session_id)
        except SymptomSession.DoesNotExist:
            return Response(
                {'error': 'Session not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Initialize LLM service
        llm_service = SymptomLLMService()

        # Get followup questions based on initial assessment and answers
        followup_result = llm_service.generate_followup_questions(
            session.ai_conversation_log,
            answers
        )

        # Update conversation log
        session.ai_conversation_log.append({
            'type': 'followup_questions',
            'answers': answers,
            'followup_result': followup_result,
            'timestamp': session.created_at.isoformat()
        })
        session.save()

        return Response(followup_result)

    except Exception as e:
        logger.error(f"Error in followup_questions: {str(e)}")
        return Response(
            {'error': 'Internal server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def finalize_assessment(request, session_id):
    """
    Finalize the symptom assessment and get results.
    """
    try:
        final_answers = request.data.get('final_answers', {})

        try:
            session = SymptomSession.objects.get(id=session_id)
        except SymptomSession.DoesNotExist:
            return Response(
                {'error': 'Session not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Initialize LLM service
        llm_service = SymptomLLMService()

        # Get final assessment
        final_result = llm_service.generate_final_assessment(
            session.ai_conversation_log,
            final_answers
        )

        # Update session with results
        session.triage_level = final_result.get('triage_level', 'routine')
        session.pre_visit_report = final_result
        session.ai_conversation_log.append({
            'type': 'final_assessment',
            'final_answers': final_answers,
            'final_result': final_result,
            'timestamp': session.created_at.isoformat()
        })
        session.save()

        return Response(final_result)

    except Exception as e:
        logger.error(f"Error in finalize_assessment: {str(e)}")
        return Response(
            {'error': 'Internal server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )</content>
<parameter name="filePath">c:\Users\peter\Downloads\gtstuff\HealthAgent\api\views_symptom.py