/**
 * Symptom Check: guided flow with an optional welcome landing on step 1, then the intake form.
 * Steps 2–3 call Django `POST /api/symptom/survey-llm/` via `symptomLlmClient` (JWT on `apiClient`).
 * Step 3 loads nearby facilities from `POST /api/symptom/nearby-facilities/` (NPPES + Census geocoding via Django).
 *
 * Progress is mirrored to `localStorage` (see `symptomCheckSession.ts`) so users can resume
 * after refresh or navigation; in-flight LLM phases are re-requested on "Resume".
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchSymptomSessionResume } from '../api/queries';
import { LinearLoadingBar, useSimulatedProgress } from '../components/LinearLoadingBar';
import type {
  FollowUpAnswer,
  FollowUpQuestion,
  PriceEstimatePayload,
  SymptomResultsPayload,
} from '../symptomCheck/types';
import {
  validateUserAddress,
  type UserAddress,
} from '../symptomCheck/addressValidation';
import {
  buildGoogleMapsUrl,
  requestNearbyFacilities,
  type NearbyFacility,
  type SymptomInsurerSlug,
} from '../symptomCheck/nppesFacilitiesClient';
import { priceEstimateCacheFingerprint } from '../symptomCheck/priceEstimateCache';
import { PRICE_ESTIMATE_STATIC_DISCLAIMER_PARAGRAPHS } from '../symptomCheck/priceEstimateStaticDisclaimer';
import { parseJsonObjectFromLlm } from '../symptomCheck/parseLlmJson';
import { US_STATE_OPTIONS, type UsStateCode } from '../symptomCheck/usStates';
import {
  requestConditionAssessment,
  requestFollowUpQuestions,
  requestPriceEstimate,
  requestSecondFollowUpQuestions,
  type StructuredFollowUpAnswer,
} from '../symptomCheck/symptomLlmClient';
import type { FollowUpQuestionsWithSession } from '../symptomCheck/types';
import {
  MULTI_CHOICE_NONE_OF_ABOVE_ID,
  validateFollowUpQuestionsPayload,
  validatePriceEstimatePayload,
  validateSymptomResultsPayload,
} from '../symptomCheck/validatePayloads';
import { InsuranceCompanyLogo } from '../symptomCheck/InsuranceCompanyLogos';
import {
  SYMPTOM_CHECK_SESSION_VERSION,
  clearSymptomCheckSession,
  isRecoverableSymptomCheckSession,
  readSymptomCheckSession,
  writeSymptomCheckSession,
  type SymptomCheckFlowStep,
  type SymptomCheckPendingRequest,
  type SymptomCheckSessionSnapshot,
} from '../symptomCheck/symptomCheckSession';

const INSURANCE_OPTIONS = [
  { id: 'centene', label: 'Centene / Ambetter' },
  { id: 'cigna', label: 'Cigna' },
  { id: 'healthnet', label: 'Health Net' },
  { id: 'fidelis', label: 'Fidelis Care' },
  { id: 'unitedhealthcare', label: 'UnitedHealthcare' },
  { id: 'elevance', label: 'Elevance Health (Anthem)' },
  { id: 'humana', label: 'Humana' },
  { id: 'bluecross', label: 'Blue Cross Blue Shield' },
  { id: 'aetna', label: 'Aetna' },
  { id: 'other', label: 'Other / not listed' },
] as const;

type InsuranceId = (typeof INSURANCE_OPTIONS)[number]['id'];

/** Which address inputs have been blurred; errors show only after blur if still invalid. */
type AddressFieldKey = 'street' | 'city' | 'state' | 'postalCode';

const INITIAL_ADDRESS_BLURRED: Record<AddressFieldKey, boolean> = {
  street: false,
  city: false,
  state: false,
  postalCode: false,
};

function insuranceLabel(id: InsuranceId): string {
  return INSURANCE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/** Ensures persisted insurer ids still match the current option list. */
function normalizeInsuranceId(id: string): InsuranceId | '' {
  if (id === '') return '';
  const legacy: Record<string, InsuranceId> = { wellcare: 'elevance' };
  const mapped = legacy[id] ?? id;
  const found = INSURANCE_OPTIONS.find((o) => o.id === mapped);
  return found ? found.id : '';
}

/** Illustrative cost copy is not tied to specific facilities until billing integration lands. */
function buildGenericCostNarrative(insurerLabel: string): string {
  return `Based on publicly posted in-network prices for ${insurerLabel}, negotiated amounts vary widely by facility, procedure code, and plan design. This is not your personal cost; your deductible and coinsurance can change what you pay.\n\nFacility-specific price examples are not shown in this preview.`;
}

/** When the LLM is unavailable, show the legacy narrative in the same layout as a structured estimate. */
function defaultPriceEstimateFallback(insurerLabel: string): PriceEstimatePayload {
  const parts = buildGenericCostNarrative(insurerLabel)
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    cost_range_label: 'Varies widely (illustrative)',
    cost_range_explanation: parts.join(' '),
  };
}

/** Buckets Django `relevance_score` (NPI registry heuristics; public reviews are not available there). */
function facilityListingFitLabel(score: number): string {
  if (score >= 10) return 'Stronger directory match (name & facility type)';
  if (score >= 5) return 'Typical facility listing';
  return 'Weaker directory signals — confirm before visiting';
}

/** Coarse TIC file match — not eligibility. */
function facilityNetworkBadge(h: NearbyFacility): { label: string; className: string } {
  if (h.in_network === true) {
    return {
      label: 'Likely in-network (file match)',
      className:
        'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border border-emerald-800/25 bg-emerald-500/12 text-emerald-950',
    };
  }
  if (h.in_network === false) {
    return {
      label: 'Not listed in posted directory',
      className:
        'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border border-outline-variant/40 bg-surface-container-low text-on-surface-variant',
    };
  }
  return {
    label: 'Directory match n/a',
    className:
      'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border border-outline-variant/25 bg-surface-container-lowest text-on-surface-variant',
  };
}

/** Map insurer label from LLM payloads / resume API back to a known option id when possible. */
function insuranceIdFromLabel(label: string): InsuranceId | '' {
  const t = label.trim().toLowerCase();
  if (!t) return '';
  const legacy: Record<string, InsuranceId> = {
    'united healthcare': 'unitedhealthcare',
    unitedhealthcare: 'unitedhealthcare',
    uhc: 'unitedhealthcare',
    elevance: 'elevance',
    anthem: 'elevance',
    aetna: 'aetna',
    'aetna cvs': 'aetna',
    'aetna cvs health': 'aetna',
    wellcare: 'elevance',
    bcbs: 'bluecross',
    'blue cross': 'bluecross',
    'blue shield': 'bluecross',
    'blue cross blue shield': 'bluecross',
  };
  if (legacy[t]) return legacy[t];
  for (const o of INSURANCE_OPTIONS) {
    if (o.label.toLowerCase() === t) return o.id;
  }
  for (const o of INSURANCE_OPTIONS) {
    const ol = o.label.toLowerCase();
    if (t.includes(ol) || ol.includes(t)) return o.id;
  }
  return '';
}

function buildStructuredAnswers(
  questions: FollowUpQuestion[],
  answers: Record<string, FollowUpAnswer>,
): StructuredFollowUpAnswer[] {
  return questions.map((q) => ({
    question_id: q.id,
    question_prompt: q.prompt,
    input_type: q.input_type,
    value: answers[q.id] ?? (q.input_type === 'multi_choice' ? [] : ''),
  }));
}

/** Default control values so required validation and sliders start in a defined state. */
/** Maps legacy `none` ids from persisted sessions to the canonical multi-select exclusive id. */
function migrateLegacyMultiChoiceAnswers(
  answers: Record<string, FollowUpAnswer>,
  questions: FollowUpQuestion[],
): Record<string, FollowUpAnswer> {
  const out = { ...answers };
  for (const q of questions) {
    if (q.input_type !== 'multi_choice') continue;
    const v = out[q.id];
    if (!Array.isArray(v)) continue;
    out[q.id] = v.map((id) => (id === 'none' ? MULTI_CHOICE_NONE_OF_ABOVE_ID : id));
  }
  return out;
}

function buildInitialAnswers(
  questions: FollowUpQuestion[],
): Record<string, FollowUpAnswer> {
  const out: Record<string, FollowUpAnswer> = {};
  for (const q of questions) {
    if (q.input_type === 'multi_choice') {
      out[q.id] = [];
    } else if (q.input_type === 'scale_1_10') {
      const min = q.scale_min ?? 1;
      out[q.id] = min;
    } else if (q.input_type === 'text') {
      out[q.id] = '';
    } else {
      out[q.id] = '';
    }
  }
  return out;
}

/** Mirrors required flags from the LLM question list (optional questions can stay empty). */
function followUpAnswersSatisfy(
  questions: FollowUpQuestion[],
  answers: Record<string, FollowUpAnswer>,
): boolean {
  for (const q of questions) {
    if (!q.required) continue;
    const v = answers[q.id];
    if (q.input_type === 'single_choice') {
      if (typeof v !== 'string' || v.trim() === '') return false;
    } else if (q.input_type === 'text') {
      if (typeof v !== 'string' || v.trim() === '') return false;
    } else if (q.input_type === 'multi_choice') {
      if (!Array.isArray(v) || v.length === 0) return false;
    } else if (q.input_type === 'scale_1_10') {
      if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    }
  }
  return true;
}

/** Tailwind bundles for overall / per-condition severity chips (mild | moderate | severe). */
function severityStyles(level: string): string {
  if (level === 'severe') {
    return 'bg-error-container/40 text-on-error-container border border-red-800/40';
  }
  if (level === 'moderate') {
    return 'bg-orange-500/12 text-orange-800 border border-orange-400/35';
  }
  return 'bg-teal-500/12 text-teal-800 border border-teal-400/35';
}

/** App content scrolls inside `Layout`'s `<main>`; reset both so each flow step starts at the top. */
function scrollAppToTop(): void {
  const run = () => {
    document.querySelector('main')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  run();
  requestAnimationFrame(run);
}

/** Step 1 welcome vs questionnaire form (not persisted; URL session and resume skip welcome). */
type IntakeSubstep = 'welcome' | 'form';

function initialIntakeSubstepFromLocation(): IntakeSubstep {
  if (typeof window === 'undefined') return 'welcome';
  if (new URLSearchParams(window.location.search).get('session')?.trim()) return 'form';
  return 'welcome';
}

const SymptomCheckPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<SymptomCheckFlowStep>('intake');
  const [intakeSubstep, setIntakeSubstep] = useState<IntakeSubstep>(
    initialIntakeSubstepFromLocation,
  );
  const [symptoms, setSymptoms] = useState('');
  const [insurance, setInsurance] = useState<InsuranceId | ''>('');
  /** Step 1: practice location for NPPES distance ranking (mirrored to `symptomCheckSession`). */
  const [userAddress, setUserAddress] = useState<UserAddress>({
    street: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [addressFieldBlurred, setAddressFieldBlurred] = useState<
    Record<AddressFieldKey, boolean>
  >(INITIAL_ADDRESS_BLURRED);
  // Step 2: populated after the first LLM call; keys match `FollowUpQuestion.id`.
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<
    Record<string, FollowUpAnswer>
  >({});
  const [secondFollowUpQuestions, setSecondFollowUpQuestions] = useState<
    FollowUpQuestion[]
  >([]);
  const [secondFollowUpAnswers, setSecondFollowUpAnswers] = useState<
    Record<string, FollowUpAnswer>
  >({});
  const [results, setResults] = useState<SymptomResultsPayload | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  /** Step 3: NPPES-backed facilities (relevance + distance on the server). */
  const [nearbyFacilities, setNearbyFacilities] = useState<NearbyFacility[] | null>(
    null,
  );
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyTaxonomyUsed, setNearbyTaxonomyUsed] = useState<string | null>(null);
  /** Illustrative cost from `price_estimate_context` LLM turn; null uses `defaultPriceEstimateFallback`. */
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimatePayload | null>(null);
  /** When this matches `priceEstimateCacheFingerprint(session, results)`, we skip refetching the price LLM. */
  const [priceEstimateCacheFingerprintState, setPriceEstimateCacheFingerprintState] =
    useState<string | null>(null);
  const [priceEstimateLoading, setPriceEstimateLoading] = useState(false);
  /** Fades results content in after the LLM response lands. */
  const [resultsEntered, setResultsEntered] = useState(false);
  /** Tracks in-flight LLM phases for UI disable + session resume (see `symptomCheckSession`). */
  const [pendingRequest, setPendingRequest] =
    useState<SymptomCheckPendingRequest>(null);
  /** Django `SymptomSession.public_id` after follow-up questions; sent with condition assessment. */
  const [surveyBackendSessionId, setSurveyBackendSessionId] = useState<string | null>(
    null,
  );
  const [urlSessionHydrating, setUrlSessionHydrating] = useState(false);
  const [resumeChatNotice, setResumeChatNotice] = useState(false);

  const followUpMutation = useMutation({
    mutationFn: (vars: {
      symptoms: string;
      insuranceLabel: string;
    }): Promise<FollowUpQuestionsWithSession> => requestFollowUpQuestions(vars),
  });

  const resultsMutation = useMutation({
    mutationFn: (vars: {
      symptoms: string;
      insuranceLabel: string;
      followUpAnswers: StructuredFollowUpAnswer[];
      sessionId: string;
    }) => requestConditionAssessment(vars),
  });

  const followUpLoading = followUpMutation.isPending;
  const resultsLoading = resultsMutation.isPending;
  const followUpProgress = useSimulatedProgress(followUpLoading);
  const resultsProgress = useSimulatedProgress(resultsLoading);
  const roundTwoRequestProgress = useSimulatedProgress(
    pendingRequest === 'followup_round_2',
  );
  const priceEstimateProgress = useSimulatedProgress(priceEstimateLoading);

  /**
   * `need-choice`: show Resume / Start over until the user picks one (see lazy init below).
   * `ready`: normal operation; state syncs to `localStorage`.
   */
  const [sessionGate, setSessionGate] = useState<'need-choice' | 'ready'>(() => {
    if (typeof window === 'undefined') return 'ready';
    const params = new URLSearchParams(window.location.search);
    if (params.get('session')?.trim()) return 'ready';
    const snap = readSymptomCheckSession();
    if (snap && isRecoverableSymptomCheckSession(snap)) return 'need-choice';
    return 'ready';
  });

  const addressValidation = useMemo(
    () => validateUserAddress(userAddress),
    [userAddress],
  );

  /** Deep link from dashboard: `?session=<uuid>` loads server state and skips the local resume modal. */
  useEffect(() => {
    const sid = searchParams.get('session')?.trim();
    if (!sid) return;

    let cancelled = false;
    setSessionGate('ready');
    setUrlSessionHydrating(true);
    setLlmError(null);
    setResumeChatNotice(false);
    setPriceEstimate(null);
    setPriceEstimateCacheFingerprintState(null);

    void (async () => {
      try {
        clearSymptomCheckSession();
        const data = await fetchSymptomSessionResume(sid);
        if (cancelled) return;

        setSurveyBackendSessionId(sid);
        setSymptoms(data.symptoms ?? '');
        const resumedSlug = insuranceIdFromLabel(data.insurance_label ?? '');
        setInsurance(resumedSlug);
        setPendingRequest(null);
        setResultsEntered(false);

        if (data.resume_step === 'followup' && data.followup_raw_text) {
          try {
            const parsed = parseJsonObjectFromLlm(data.followup_raw_text);
            const { questions } = validateFollowUpQuestionsPayload(parsed);
            setFollowUpQuestions(questions);
            setFollowUpAnswers(buildInitialAnswers(questions));
            setSecondFollowUpQuestions([]);
            setSecondFollowUpAnswers({});
            setResults(null);
            setStep('followup');
          } catch {
            setLlmError('Could not restore follow-up questions from this session.');
            setStep('intake');
            setIntakeSubstep('form');
            setFollowUpQuestions([]);
            setFollowUpAnswers({});
          }
        } else if (data.resume_step === 'results' && data.results_raw_text) {
          try {
            const parsed = parseJsonObjectFromLlm(data.results_raw_text);
            const resPayload = validateSymptomResultsPayload(parsed);
            setFollowUpQuestions([]);
            setFollowUpAnswers({});
            setResults({
              ...resPayload,
              ...(resumedSlug ? { intake_insurer_slug: resumedSlug } : {}),
            });
            setStep('results');
            if (data.price_estimate_raw_text) {
              try {
                const priceParsed = parseJsonObjectFromLlm(
                  data.price_estimate_raw_text,
                );
                const pe = validatePriceEstimatePayload(priceParsed);
                setPriceEstimate(pe);
                setPriceEstimateCacheFingerprintState(
                  priceEstimateCacheFingerprint(sid, resPayload),
                );
              } catch {
                setPriceEstimate(null);
                setPriceEstimateCacheFingerprintState(null);
              }
            } else {
              setPriceEstimate(null);
              setPriceEstimateCacheFingerprintState(null);
            }
          } catch {
            setLlmError('Could not restore results from this session.');
            setStep('intake');
            setIntakeSubstep('form');
          }
        } else if (data.resume_step === 'chat') {
          setFollowUpQuestions([]);
          setFollowUpAnswers({});
          setResults(null);
          setStep('intake');
          setIntakeSubstep('form');
          setResumeChatNotice(true);
        } else {
          setFollowUpQuestions([]);
          setFollowUpAnswers({});
          setResults(null);
          setStep('intake');
          setIntakeSubstep('form');
        }

        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('session');
            return next;
          },
          { replace: true },
        );
      } catch (e) {
        if (!cancelled) {
          setLlmError(
            e instanceof Error
              ? e.message
              : 'Unable to load this session. Try again from the dashboard.',
          );
          setStep('intake');
          setIntakeSubstep('form');
        }
      } finally {
        if (!cancelled) setUrlSessionHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const intakeValid =
    symptoms.trim().length > 0 && insurance !== '' && addressValidation.valid;

  const followUpValid = followUpAnswersSatisfy(followUpQuestions, followUpAnswers);

  const secondFollowUpValid =
    secondFollowUpQuestions.length === 0 ||
    followUpAnswersSatisfy(secondFollowUpQuestions, secondFollowUpAnswers);

  const insurerLabel = useMemo(
    () => (insurance ? insuranceLabel(insurance) : ''),
    [insurance],
  );

  /** Show likely in-network matches first when Django supplies booleans; preserve API order within each band. */
  const displayedNearbyFacilities = useMemo(() => {
    if (!nearbyFacilities || nearbyFacilities.length === 0) return [];
    const rank = (h: NearbyFacility): number => {
      if (h.in_network === true) return 0;
      if (h.in_network === false) return 1;
      return 2;
    };
    return [...nearbyFacilities]
      .map((h, i) => ({ h, i }))
      .sort((a, b) => {
        const d = rank(a.h) - rank(b.h);
        if (d !== 0) return d;
        return a.i - b.i;
      })
      .map(({ h }) => h);
  }, [nearbyFacilities]);

  const effectivePriceEstimate = useMemo(
    () => priceEstimate ?? defaultPriceEstimateFallback(insurerLabel),
    [priceEstimate, insurerLabel],
  );

  /** First LLM call (intake → follow-up questions). Params allow resume without relying on async state. */
  const runFollowUpRequest = async (input: {
    symptoms: string;
    insuranceLabel: string;
  }) => {
    setLlmError(null);
    setPendingRequest('followup');
    try {
      const data = await followUpMutation.mutateAsync({
        symptoms: input.symptoms,
        insuranceLabel: input.insuranceLabel,
      });
      setSurveyBackendSessionId(data.session_id);
      setFollowUpQuestions(data.questions);
      setFollowUpAnswers(buildInitialAnswers(data.questions));
      setSecondFollowUpQuestions([]);
      setSecondFollowUpAnswers({});
      setResults(null);
      setStep('followup');
      scrollAppToTop();
    } catch (err) {
      setLlmError(
        err instanceof Error ? err.message : 'Unable to load follow-up questions.',
      );
    } finally {
      setPendingRequest(null);
    }
  };

  /** Final LLM call (follow-up round(s) → results). Supports one or two question rounds. */
  const runResultsRequest = async (input: {
    symptoms: string;
    insuranceLabel: string;
    questionsRound1: FollowUpQuestion[];
    answersRound1: Record<string, FollowUpAnswer>;
    questionsRound2?: FollowUpQuestion[];
    answersRound2?: Record<string, FollowUpAnswer>;
    backendSessionId: string | null;
    /** Step-1 payer id for NPPES network hints (copied onto `results` so nearby fetch cannot miss it). */
    intakeInsurerSlug: InsuranceId | '';
  }) => {
    const q2 = input.questionsRound2 ?? [];
    const a2 = input.answersRound2 ?? {};
    if (!followUpAnswersSatisfy(input.questionsRound1, input.answersRound1)) {
      setLlmError('Saved answers are incomplete. Please review the questionnaire.');
      return;
    }
    if (q2.length > 0 && !followUpAnswersSatisfy(q2, a2)) {
      setLlmError('Saved answers are incomplete. Please review the questionnaire.');
      return;
    }
    if (!input.backendSessionId) {
      setLlmError(
        'This session is missing server data. Please start a new symptom check from the beginning.',
      );
      return;
    }
    scrollAppToTop();
    setLlmError(null);
    setPendingRequest('results');
    try {
      const structured = [
        ...buildStructuredAnswers(input.questionsRound1, input.answersRound1),
        ...buildStructuredAnswers(q2, a2),
      ];

      const payload = await resultsMutation.mutateAsync({
        symptoms: input.symptoms,
        insuranceLabel: input.insuranceLabel,
        followUpAnswers: structured,
        sessionId: input.backendSessionId,
      });
      setResults({
        ...payload,
        ...(input.intakeInsurerSlug
          ? { intake_insurer_slug: input.intakeInsurerSlug }
          : {}),
      });
      setStep('results');
      void queryClient.invalidateQueries({ queryKey: ['symptom-sessions'] });
    } catch (err) {
      setLlmError(
        err instanceof Error ? err.message : 'Unable to load assessment results.',
      );
    } finally {
      setPendingRequest(null);
    }
  };

  /** After round 1: either a second question round or jump straight to condition assessment. */
  const handleCheckAndProceed = async () => {
    if (!followUpValid || pendingRequest) return;
    if (!surveyBackendSessionId) {
      setLlmError(
        'This session is missing server data. Please start a new symptom check from the beginning.',
      );
      return;
    }
    scrollAppToTop();
    setLlmError(null);
    setPendingRequest('followup_round_2');
    try {
      const structured = buildStructuredAnswers(followUpQuestions, followUpAnswers);
      const data = await requestSecondFollowUpQuestions({
        symptoms: symptoms.trim(),
        insuranceLabel: insurerLabel,
        firstRoundAnswers: structured,
        sessionId: surveyBackendSessionId,
      });

      if (data.questions.length === 0) {
        await runResultsRequest({
          symptoms: symptoms.trim(),
          insuranceLabel: insurerLabel,
          questionsRound1: followUpQuestions,
          answersRound1: followUpAnswers,
          backendSessionId: surveyBackendSessionId,
          intakeInsurerSlug: insurance,
        });
      } else {
        setSecondFollowUpQuestions(data.questions);
        setSecondFollowUpAnswers(buildInitialAnswers(data.questions));
        setStep('followup_round_2');
        scrollAppToTop();
      }
    } catch (err) {
      setLlmError(
        err instanceof Error ? err.message : 'Unable to evaluate. Please try again.',
      );
    } finally {
      setPendingRequest(null);
    }
  };

  /** Step 1 → 2: first LLM request; on success we render dynamic questions. */
  const handleContinueToFollowUp = async () => {
    if (!intakeValid || pendingRequest) return;
    await runFollowUpRequest({
      symptoms: symptoms.trim(),
      insuranceLabel: insurerLabel,
    });
  };

  /** Round 2 (if any) → condition assessment. */
  const handleSeeResults = async () => {
    if (!followUpValid || !secondFollowUpValid || pendingRequest) return;
    scrollAppToTop();
    await runResultsRequest({
      symptoms: symptoms.trim(),
      insuranceLabel: insurerLabel,
      questionsRound1: followUpQuestions,
      answersRound1: followUpAnswers,
      questionsRound2: secondFollowUpQuestions,
      answersRound2: secondFollowUpAnswers,
      backendSessionId: surveyBackendSessionId,
      intakeInsurerSlug: insurance,
    });
  };

  /** App content scrolls inside `Layout`’s `<main>`; reset both so each flow step starts at the top. */
  useEffect(() => {
    scrollAppToTop();
  }, [step, intakeSubstep]);

  // Mirror flow state to localStorage whenever the user is past the resume gate.
  useEffect(() => {
    if (sessionGate !== 'ready') return;

    const snapshot: SymptomCheckSessionSnapshot = {
      version: SYMPTOM_CHECK_SESSION_VERSION,
      updatedAt: new Date().toISOString(),
      step,
      symptoms,
      insurance,
      address: {
        street: userAddress.street,
        city: userAddress.city,
        state: userAddress.state,
        postalCode: userAddress.postalCode,
      },
      followUpQuestions,
      followUpAnswers,
      secondFollowUpQuestions,
      secondFollowUpAnswers,
      results,
      pendingRequest,
      llmError,
      surveyBackendSessionId,
      priceEstimate,
      priceEstimateCacheFingerprint: priceEstimateCacheFingerprintState,
    };
    writeSymptomCheckSession(snapshot);
  }, [
    sessionGate,
    step,
    symptoms,
    insurance,
    userAddress,
    followUpQuestions,
    followUpAnswers,
    secondFollowUpQuestions,
    secondFollowUpAnswers,
    results,
    pendingRequest,
    llmError,
    surveyBackendSessionId,
    priceEstimate,
    priceEstimateCacheFingerprintState,
  ]);

  /** After the LLM returns `care_taxonomy`, ask Django to rank NPPES facilities by road distance (via geocoding). */
  useEffect(() => {
    if (step !== 'results') {
      setNearbyFacilities(null);
      setNearbyError(null);
      setNearbyTaxonomyUsed(null);
      setNearbyLoading(false);
      return;
    }
    if (!results) return;

    if (!addressValidation.valid) {
      setNearbyFacilities(null);
      setNearbyTaxonomyUsed(null);
      setNearbyError(
        'Add a valid US address on step 1 to see nearby facilities. Go back to the first step, enter your address, then continue.',
      );
      setNearbyLoading(false);
      return;
    }

    let cancelled = false;
    setNearbyLoading(true);
    setNearbyError(null);
    setNearbyFacilities(null);
    setNearbyTaxonomyUsed(null);

    const run = async () => {
      try {
        const slugRaw = (results.intake_insurer_slug ?? '').trim() || insurance;
        const payload = await requestNearbyFacilities({
          street: userAddress.street.trim(),
          city: userAddress.city.trim(),
          state: userAddress.state,
          postal_code: userAddress.postalCode.trim(),
          taxonomy_codes: results.care_taxonomy.taxonomy_codes,
          suggested_care_setting: results.care_taxonomy.suggested_care_setting,
          ...(slugRaw ? { insurer_slug: slugRaw as SymptomInsurerSlug } : {}),
        });
        if (cancelled) return;
        setNearbyFacilities(payload.facilities);
        setNearbyTaxonomyUsed(payload.taxonomy_used);
      } catch (e) {
        if (cancelled) return;
        setNearbyFacilities(null);
        setNearbyError(
          e instanceof Error ? e.message : 'Unable to load nearby facilities.',
        );
      } finally {
        if (!cancelled) setNearbyLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    results,
    addressValidation.valid,
    userAddress.street,
    userAddress.city,
    userAddress.state,
    userAddress.postalCode,
    insurance,
  ]);

  /** After NPPES finishes (or is skipped), one DeepSeek turn for cost copy tied to conditions + top facility. */
  useEffect(() => {
    if (step !== 'results') {
      setPriceEstimate(null);
      setPriceEstimateCacheFingerprintState(null);
      setPriceEstimateLoading(false);
      return;
    }
    if (!results || !surveyBackendSessionId || nearbyLoading) {
      return;
    }

    const fp = priceEstimateCacheFingerprint(surveyBackendSessionId, results);
    if (priceEstimateCacheFingerprintState === fp && priceEstimate !== null) {
      setPriceEstimateLoading(false);
      return;
    }

    let cancelled = false;
    setPriceEstimateLoading(true);
    setPriceEstimate(null);
    setPriceEstimateCacheFingerprintState(null);

    const top =
      nearbyFacilities && nearbyFacilities.length > 0
        ? {
            npi: nearbyFacilities[0].npi,
            name: nearbyFacilities[0].name,
            address_line: nearbyFacilities[0].address_line,
          }
        : null;

    void (async () => {
      try {
        const out = await requestPriceEstimate({
          insuranceLabel: insurerLabel,
          results,
          topFacility: top,
          sessionId: surveyBackendSessionId,
        });
        if (!cancelled) {
          setPriceEstimate(out);
          setPriceEstimateCacheFingerprintState(fp);
        }
      } catch {
        if (!cancelled) {
          setPriceEstimate(null);
          setPriceEstimateCacheFingerprintState(null);
        }
      } finally {
        if (!cancelled) {
          setPriceEstimateLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `priceEstimate` is read inside the skip check but omitted from deps so clearing it for a
    // refetch does not immediately rerun this effect and cancel the in-flight request.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- priceEstimate read for cache hit only
  }, [
    step,
    results,
    surveyBackendSessionId,
    nearbyLoading,
    nearbyFacilities,
    insurerLabel,
    priceEstimateCacheFingerprintState,
  ]);

  const applySnapshotToState = (snap: SymptomCheckSessionSnapshot) => {
    const insId = normalizeInsuranceId(snap.insurance);
    setStep(snap.step);
    setSymptoms(snap.symptoms);
    setInsurance(insId);
    setUserAddress({
      street: snap.address.street,
      city: snap.address.city,
      state: (snap.address.state as UsStateCode | '') || '',
      postalCode: snap.address.postalCode,
    });
    setAddressFieldBlurred(INITIAL_ADDRESS_BLURRED);
    setFollowUpQuestions(snap.followUpQuestions);
    setFollowUpAnswers(
      migrateLegacyMultiChoiceAnswers(snap.followUpAnswers, snap.followUpQuestions),
    );
    setSecondFollowUpQuestions(snap.secondFollowUpQuestions);
    setSecondFollowUpAnswers(snap.secondFollowUpAnswers);
    setResults(
      snap.results
        ? {
            ...snap.results,
            ...(insId ? { intake_insurer_slug: insId } : {}),
          }
        : null,
    );
    setLlmError(snap.llmError);
    setSurveyBackendSessionId(snap.surveyBackendSessionId);
    setPriceEstimate(snap.priceEstimate ?? null);
    setPriceEstimateCacheFingerprintState(snap.priceEstimateCacheFingerprint ?? null);
    setPendingRequest(null);
    setIntakeSubstep('form');
  };

  /** Restore saved answers and optionally replay the in-flight LLM call from the saved phase. */
  const handleResumeSession = () => {
    const snap = readSymptomCheckSession();
    if (!snap) {
      setSessionGate('ready');
      return;
    }
    applySnapshotToState(snap);
    setSessionGate('ready');

    const ins = normalizeInsuranceId(snap.insurance);
    const label = ins ? insuranceLabel(ins) : '';
    const trimmed = snap.symptoms.trim();

    if (snap.pendingRequest === 'followup') {
      if (trimmed.length === 0 || !ins) return;
      void runFollowUpRequest({ symptoms: trimmed, insuranceLabel: label });
    } else if (snap.pendingRequest === 'followup_round_2') {
      if (trimmed.length === 0 || !ins) return;
      if (snap.followUpQuestions.length === 0) return;
      if (!snap.surveyBackendSessionId) return;
      void handleCheckAndProceed();
    } else if (snap.pendingRequest === 'results') {
      if (trimmed.length === 0 || !ins) return;
      if (snap.followUpQuestions.length === 0) return;
      void runResultsRequest({
        symptoms: trimmed,
        insuranceLabel: label,
        questionsRound1: snap.followUpQuestions,
        answersRound1: snap.followUpAnswers,
        questionsRound2: snap.secondFollowUpQuestions,
        answersRound2: snap.secondFollowUpAnswers,
        backendSessionId: snap.surveyBackendSessionId,
        intakeInsurerSlug: ins,
      });
    }
  };

  const handleStartOverFromPrompt = () => {
    clearSymptomCheckSession();
    setStep('intake');
    setSymptoms('');
    setInsurance('');
    setUserAddress({ street: '', city: '', state: '', postalCode: '' });
    setAddressFieldBlurred(INITIAL_ADDRESS_BLURRED);
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setSecondFollowUpQuestions([]);
    setSecondFollowUpAnswers({});
    setResults(null);
    setLlmError(null);
    setPendingRequest(null);
    setSurveyBackendSessionId(null);
    setResumeChatNotice(false);
    setPriceEstimate(null);
    setPriceEstimateCacheFingerprintState(null);
    setPriceEstimateLoading(false);
    setSessionGate('ready');
    setIntakeSubstep('welcome');
  };

  const restart = () => {
    clearSymptomCheckSession();
    followUpMutation.reset();
    resultsMutation.reset();
    setStep('intake');
    setSymptoms('');
    setInsurance('');
    setUserAddress({ street: '', city: '', state: '', postalCode: '' });
    setAddressFieldBlurred(INITIAL_ADDRESS_BLURRED);
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setSecondFollowUpQuestions([]);
    setSecondFollowUpAnswers({});
    setResults(null);
    setLlmError(null);
    setPendingRequest(null);
    setSurveyBackendSessionId(null);
    setResumeChatNotice(false);
    setResultsEntered(false);
    setPriceEstimate(null);
    setPriceEstimateCacheFingerprintState(null);
    setPriceEstimateLoading(false);
    setIntakeSubstep('welcome');
  };

  useEffect(() => {
    if (!results) {
      setResultsEntered(false);
      return;
    }
    setResultsEntered(false);
    const t = window.setTimeout(() => setResultsEntered(true), 40);
    return () => clearTimeout(t);
  }, [results]);

  const stepIndex =
    step === 'intake' ? 1 : step === 'followup' || step === 'followup_round_2' ? 2 : 3;

  const updateAnswer = (questionId: string, value: FollowUpAnswer) => {
    setFollowUpAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  /** “None of the above” uses id `none_of_the_above` (prompt + validation); legacy `none` is still accepted. */
  const isExclusiveNoneOptionId = (id: string) =>
    id === MULTI_CHOICE_NONE_OF_ABOVE_ID || id === 'none';

  const toggleMultiChoice = (question: FollowUpQuestion, optionId: string) => {
    const current = followUpAnswers[question.id];
    const selected = Array.isArray(current) ? [...current] : [];
    const togglingNone = isExclusiveNoneOptionId(optionId);

    let next: string[];
    if (togglingNone) {
      next = selected.includes(optionId) ? [] : [optionId];
    } else {
      const withoutNone = selected.filter((id) => !isExclusiveNoneOptionId(id));
      if (withoutNone.includes(optionId)) {
        next = withoutNone.filter((id) => id !== optionId);
      } else {
        next = [...withoutNone, optionId];
      }
    }

    updateAnswer(question.id, next);
  };

  const updateSecondRoundAnswer = (questionId: string, value: FollowUpAnswer) => {
    setSecondFollowUpAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleSecondRoundMultiChoice = (
    question: FollowUpQuestion,
    optionId: string,
  ) => {
    const current = secondFollowUpAnswers[question.id];
    const selected = Array.isArray(current) ? [...current] : [];
    const togglingNone = isExclusiveNoneOptionId(optionId);

    let next: string[];
    if (togglingNone) {
      next = selected.includes(optionId) ? [] : [optionId];
    } else {
      const withoutNone = selected.filter((id) => !isExclusiveNoneOptionId(id));
      if (withoutNone.includes(optionId)) {
        next = withoutNone.filter((id) => id !== optionId);
      } else {
        next = [...withoutNone, optionId];
      }
    }

    updateSecondRoundAnswer(question.id, next);
  };

  /** Maps each `input_type` from the LLM to the same control patterns as the old static step. */
  const renderFollowUpQuestion = (q: FollowUpQuestion) => {
    const value = followUpAnswers[q.id];

    if (q.input_type === 'single_choice' && q.options) {
      return (
        <fieldset className="border-0 p-0 m-0 mb-16" key={q.id}>
          <legend className="text-sm font-semibold text-on-surface mb-3 block">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </legend>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-3">
              {q.helper_text}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const selected = value === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                    selected
                      ? 'border-secondary bg-secondary-fixed/10 ring-1 ring-secondary'
                      : 'border-outline-variant/25 bg-surface'
                  }`}
                >
                  <input
                    checked={selected}
                    className="accent-secondary w-4 h-4 shrink-0"
                    name={q.id}
                    type="radio"
                    value={opt.id}
                    onChange={() => updateAnswer(q.id, opt.id)}
                  />
                  <span className="font-body text-sm text-on-surface">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    if (q.input_type === 'multi_choice' && q.options) {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="border-0 p-0 m-0 mb-16" key={q.id}>
          <legend className="text-sm font-semibold text-on-surface mb-3 block">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </legend>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-3">
              {q.helper_text}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                    checked
                      ? 'border-secondary bg-secondary-fixed/10 ring-1 ring-secondary'
                      : 'border-outline-variant/25 bg-surface'
                  }`}
                >
                  <input
                    checked={checked}
                    className="accent-secondary w-4 h-4 shrink-0"
                    type="checkbox"
                    onChange={() => toggleMultiChoice(q, opt.id)}
                  />
                  <span className="font-body text-sm text-on-surface">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    if (q.input_type === 'text') {
      const textVal = typeof value === 'string' ? value : '';
      return (
        <div key={q.id}>
          <label
            className="block text-sm font-semibold text-on-surface mb-2"
            htmlFor={`followup-${q.id}`}
          >
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-2">
              {q.helper_text}
            </p>
          ) : null}
          <textarea
            className="w-full min-h-[120px] bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner resize-y"
            id={`followup-${q.id}`}
            value={textVal}
            onChange={(e) => updateAnswer(q.id, e.target.value)}
          />
        </div>
      );
    }

    if (q.input_type === 'scale_1_10') {
      const min = q.scale_min ?? 1;
      const max = q.scale_max ?? 10;
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : min;
      const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div key={q.id}>
          <p className="text-sm font-semibold text-on-surface mb-2">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </p>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant mb-4 font-body">
              {q.helper_text}
            </p>
          ) : null}
          <div className="bg-surface px-5 py-6 rounded-xl border border-outline-variant/10">
            <div className="flex justify-between text-xs font-semibold text-primary mb-3 px-1 gap-1 overflow-x-auto">
              {ticks.map((t) => (
                <span key={t} className="shrink-0">
                  {t}
                </span>
              ))}
            </div>
            <input
              aria-valuemax={max}
              aria-valuemin={min}
              aria-valuenow={numeric}
              className="w-full"
              max={max}
              min={min}
              type="range"
              value={numeric}
              onChange={(e) => updateAnswer(q.id, Number(e.target.value))}
            />
            <div className="flex justify-between text-xs text-on-surface-variant mt-3 px-1 font-medium">
              <span>{q.scale_min_label ?? 'Low'}</span>
              <span className="text-on-surface font-semibold">{numeric}</span>
              <span className="text-error font-bold">
                {q.scale_max_label ?? 'High'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  /** Second-round questions (same controls as round 1; separate state). */
  const renderSecondRoundQuestion = (q: FollowUpQuestion) => {
    const value = secondFollowUpAnswers[q.id];

    if (q.input_type === 'single_choice' && q.options) {
      return (
        <fieldset className="border-0 p-0 m-0 mb-16" key={q.id}>
          <legend className="text-sm font-semibold text-on-surface mb-3 block">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </legend>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-3">
              {q.helper_text}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const selected = value === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                    selected
                      ? 'border-secondary bg-secondary-fixed/10 ring-1 ring-secondary'
                      : 'border-outline-variant/25 bg-surface'
                  }`}
                >
                  <input
                    checked={selected}
                    className="accent-secondary w-4 h-4 shrink-0"
                    name={`round2-${q.id}`}
                    type="radio"
                    value={opt.id}
                    onChange={() => updateSecondRoundAnswer(q.id, opt.id)}
                  />
                  <span className="font-body text-sm text-on-surface">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    if (q.input_type === 'multi_choice' && q.options) {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="border-0 p-0 m-0 mb-16" key={q.id}>
          <legend className="text-sm font-semibold text-on-surface mb-3 block">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </legend>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-3">
              {q.helper_text}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                    checked
                      ? 'border-secondary bg-secondary-fixed/10 ring-1 ring-secondary'
                      : 'border-outline-variant/25 bg-surface'
                  }`}
                >
                  <input
                    checked={checked}
                    className="accent-secondary w-4 h-4 shrink-0"
                    type="checkbox"
                    onChange={() => toggleSecondRoundMultiChoice(q, opt.id)}
                  />
                  <span className="font-body text-sm text-on-surface">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    if (q.input_type === 'text') {
      const textVal = typeof value === 'string' ? value : '';
      return (
        <div key={q.id}>
          <label
            className="block text-sm font-semibold text-on-surface mb-2"
            htmlFor={`followup-round2-${q.id}`}
          >
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-2">
              {q.helper_text}
            </p>
          ) : null}
          <textarea
            className="w-full min-h-[120px] bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner resize-y"
            id={`followup-round2-${q.id}`}
            value={textVal}
            onChange={(e) => updateSecondRoundAnswer(q.id, e.target.value)}
          />
        </div>
      );
    }

    if (q.input_type === 'scale_1_10') {
      const min = q.scale_min ?? 1;
      const max = q.scale_max ?? 10;
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : min;
      const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div key={q.id}>
          <p className="text-sm font-semibold text-on-surface mb-2">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </p>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant mb-4 font-body">
              {q.helper_text}
            </p>
          ) : null}
          <div className="bg-surface px-5 py-6 rounded-xl border border-outline-variant/10">
            <div className="flex justify-between text-xs font-semibold text-primary mb-3 px-1 gap-1 overflow-x-auto">
              {ticks.map((t) => (
                <span key={t} className="shrink-0">
                  {t}
                </span>
              ))}
            </div>
            <input
              aria-valuemax={max}
              aria-valuemin={min}
              aria-valuenow={numeric}
              className="w-full"
              max={max}
              min={min}
              type="range"
              value={numeric}
              onChange={(e) => updateSecondRoundAnswer(q.id, Number(e.target.value))}
            />
            <div className="flex justify-between text-xs text-on-surface-variant mt-3 px-1 font-medium">
              <span>{q.scale_min_label ?? 'Low'}</span>
              <span className="text-on-surface font-semibold">{numeric}</span>
              <span className="text-error font-bold">
                {q.scale_max_label ?? 'High'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const followupRound1Busy = pendingRequest === 'followup_round_2' || resultsLoading;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12 pb-16">
      <div className="max-w-6xl mx-auto relative">
        {urlSessionHydrating ? (
          <div
            aria-busy="true"
            aria-live="polite"
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/45 p-6"
          >
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-body text-sm font-medium text-on-primary">
              Opening your saved session…
            </p>
          </div>
        ) : null}

        {sessionGate === 'need-choice' ? (
          <div
            aria-labelledby="symptom-session-resume-title"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
          >
            <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-md w-full p-6 md:p-8 border border-outline-variant/20">
              <h2
                className="text-xl font-headline font-bold text-primary mb-2"
                id="symptom-session-resume-title"
              >
                Resume your symptom check?
              </h2>
              <p className="text-sm text-on-surface-variant font-body leading-relaxed mb-6">
                We saved your progress in this browser. You can continue where you left
                off, or start over. If a question step was loading when you left, we
                will request it again when you resume.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  className="cursor-pointer gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 sm:flex-1"
                  type="button"
                  onClick={handleResumeSession}
                >
                  Resume
                  <span className="material-symbols-outlined text-lg">play_arrow</span>
                </button>
                <button
                  className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                  type="button"
                  onClick={handleStartOverFromPrompt}
                >
                  Start over
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold uppercase tracking-wider mb-4 border border-secondary-fixed-dim/30">
              <span className="material-symbols-outlined text-sm">assignment</span>
              Guided assessment
            </div>
            <h1 className="text-3xl md:text-5xl font-headline font-extrabold text-primary tracking-tight mb-2">
              Symptom Check
            </h1>
            <p className="text-on-surface-variant font-body text-base max-w-2xl">
              {step === 'intake' && intakeSubstep === 'welcome' ? (
                <>
                  Review what this guided check covers, then continue to the
                  questionnaire when you are ready. After you begin filling it out,
                  progress can be saved in this browser so you can resume if you leave
                  mid-check.
                </>
              ) : (
                <>
                  Answer a short questionnaire about what you are experiencing. We use
                  your responses to highlight possible next steps, nearby facilities,
                  and illustrative price ranges tied to the insurer you select—not a
                  personal quote.
                </>
              )}
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-sm font-body text-on-surface-variant bg-surface-container-lowest px-4 py-2 rounded-full border-ghost shadow-ambient shrink-0"
            aria-label="Assessment progress"
          >
            <span className="material-symbols-outlined text-secondary text-lg">
              data_loss_prevention
            </span>
            Step {stepIndex} of 3
          </div>
        </header>

        {resumeChatNotice && step === 'intake' && intakeSubstep === 'form' ? (
          <div
            className="mb-8 rounded-xl border border-primary/30 bg-primary-fixed/10 px-4 py-4 md:px-6 md:py-5 flex flex-col sm:flex-row sm:items-center gap-4"
            role="status"
          >
            <div className="flex-1 min-w-0">
              <p className="font-headline text-sm font-bold text-primary mb-1">
                Conversational session
              </p>
              <p className="font-body text-sm text-on-surface-variant">
                This entry was created with the live chat interview, not the structured
                Symptom Check questionnaire. You can start a new guided check below
                whenever you are ready.
              </p>
            </div>
            <button
              className="shrink-0 font-headline text-sm font-semibold text-primary border border-primary/40 rounded-lg px-4 py-2 hover:bg-primary/5 transition-colors"
              type="button"
              onClick={() => setResumeChatNotice(false)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {step === 'intake' && intakeSubstep === 'welcome' ? (
          <section className="relative overflow-hidden rounded-xl border-ghost bg-surface-container-lowest p-6 shadow-ambient md:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-secondary/10 blur-2xl" />
            <div className="relative z-10">
              <h2 className="mb-3 flex items-center gap-2 font-headline text-xl font-bold text-primary">
                <span className="material-symbols-outlined text-secondary">
                  waving_hand
                </span>
                Welcome to Symptom Check
              </h2>
              <p className="mb-6 max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant md:text-base">
                This is a structured, three-part guided assessment—not a diagnosis and
                not emergency triage. It helps you organize what you are experiencing so
                you can discuss it with a clinician or care team.
              </p>
              <ul className="mb-8 space-y-4 font-body text-sm text-on-surface md:text-base">
                <li className="flex gap-3">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed/40 font-headline text-sm font-bold text-primary"
                    aria-hidden
                  >
                    1
                  </span>
                  <div>
                    <p className="font-headline font-semibold text-on-surface">
                      Tell us the basics
                    </p>
                    <p className="mt-1 leading-relaxed text-on-surface-variant">
                      Describe your symptoms, choose an insurer for illustrative cost
                      context, and enter a US address so we can rank nearby facilities
                      from the public NPI directory.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed/40 font-headline text-sm font-bold text-primary"
                    aria-hidden
                  >
                    2
                  </span>
                  <div>
                    <p className="font-headline font-semibold text-on-surface">
                      Answer tailored questions
                    </p>
                    <p className="mt-1 leading-relaxed text-on-surface-variant">
                      We generate follow-up questions from your description (similar to
                      what a clinician might ask next). You may see one or two short
                      rounds before results.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed/40 font-headline text-sm font-bold text-primary"
                    aria-hidden
                  >
                    3
                  </span>
                  <div>
                    <p className="font-headline font-semibold text-on-surface">
                      Review illustrative results
                    </p>
                    <p className="mt-1 leading-relaxed text-on-surface-variant">
                      You will see possible conditions for discussion only, nearby
                      hospital-style listings, and general price context—not a personal
                      quote or medical decision.
                    </p>
                  </div>
                </li>
              </ul>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  className="cursor-pointer gradient-primary flex items-center justify-center gap-2 rounded-lg px-8 py-3 font-headline text-sm font-semibold text-on-primary shadow-ambient transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)]"
                  type="button"
                  onClick={() => {
                    setIntakeSubstep('form');
                    scrollAppToTop();
                  }}
                >
                  Continue to questionnaire
                  <span className="material-symbols-outlined text-lg">
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {step === 'intake' && intakeSubstep === 'form' ? (
          <section
            className={`bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost relative overflow-hidden transition-opacity duration-300 ease-out ${
              followUpLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
            <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">
                edit_note
              </span>
              Your symptoms &amp; coverage
            </h2>
            <div className="space-y-8 relative z-10">
              <div>
                <label
                  className="block text-sm font-semibold text-on-surface mb-2"
                  htmlFor="symptoms-detail"
                >
                  Describe your symptoms and what you have been experiencing
                  <span className="text-error ml-1" aria-hidden>
                    *
                  </span>
                </label>
                <textarea
                  className="w-full min-h-[160px] bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner resize-y"
                  id="symptoms-detail"
                  placeholder="Example: sharp pain in the lower right abdomen since last night, worse when walking; mild nausea; no fever measured."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                />
                <p className="mt-2 text-xs text-on-surface-variant font-body">
                  Include timing, severity, anything that makes it better or worse, and
                  relevant history if you are comfortable sharing it.
                </p>
              </div>

              <fieldset className="border-0 p-0 mx-0 mb-0">
                <legend className="block text-sm font-semibold text-on-surface mb-3">
                  Insurance provider
                  <span className="text-error ml-1" aria-hidden>
                    *
                  </span>
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {INSURANCE_OPTIONS.map((opt) => {
                    const selected = insurance === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                          selected
                            ? 'border-primary bg-primary-fixed/15 ring-1 ring-primary'
                            : 'border-outline-variant/30 bg-surface hover:border-outline-variant/60'
                        }`}
                      >
                        <input
                          checked={selected}
                          className="accent-primary w-4 h-4 shrink-0"
                          name="insurance"
                          type="radio"
                          value={opt.id}
                          onChange={() => setInsurance(opt.id)}
                        />
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <InsuranceCompanyLogo id={opt.id} />
                          <span className="min-w-0 flex-1 font-body text-sm font-medium leading-snug text-on-surface">
                            {opt.label}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="pt-10 mt-2 border-t border-outline-variant/15">
                <fieldset className="border-0 p-0 mx-0 mb-0">
                  <legend className="block text-sm font-semibold text-on-surface mb-2">
                    Current address
                    <span className="text-error ml-1" aria-hidden>
                      *
                    </span>
                  </legend>
                  <p className="text-xs text-on-surface-variant font-body mb-4">
                    Used to rank nearby facilities for your situation. US addresses only
                    (NPPES directory).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-street"
                      >
                        Street address
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <input
                        aria-invalid={
                          addressFieldBlurred.street &&
                          Boolean(addressValidation.errors.street)
                        }
                        autoComplete="street-address"
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner"
                        id="addr-street"
                        placeholder="123 Main St, Apt 4"
                        type="text"
                        value={userAddress.street}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, street: true }))
                        }
                        onChange={(e) =>
                          setUserAddress((prev) => ({
                            ...prev,
                            street: e.target.value,
                          }))
                        }
                      />
                      {addressFieldBlurred.street && addressValidation.errors.street ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.street}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-city"
                      >
                        City
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <input
                        aria-invalid={
                          addressFieldBlurred.city &&
                          Boolean(addressValidation.errors.city)
                        }
                        autoComplete="address-level2"
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner"
                        id="addr-city"
                        placeholder="City"
                        type="text"
                        value={userAddress.city}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, city: true }))
                        }
                        onChange={(e) =>
                          setUserAddress((prev) => ({ ...prev, city: e.target.value }))
                        }
                      />
                      {addressFieldBlurred.city && addressValidation.errors.city ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.city}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-state"
                      >
                        State
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <select
                        aria-invalid={
                          addressFieldBlurred.state &&
                          Boolean(addressValidation.errors.state)
                        }
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
                        id="addr-state"
                        value={userAddress.state}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, state: true }))
                        }
                        onChange={(e) =>
                          setUserAddress((prev) => ({
                            ...prev,
                            state: e.target.value as UsStateCode | '',
                          }))
                        }
                      >
                        <option value="">Select state</option>
                        {US_STATE_OPTIONS.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {addressFieldBlurred.state && addressValidation.errors.state ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.state}
                        </p>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-zip"
                      >
                        ZIP code
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <input
                        aria-invalid={
                          addressFieldBlurred.postalCode &&
                          Boolean(addressValidation.errors.postalCode)
                        }
                        inputMode="numeric"
                        autoComplete="postal-code"
                        className="w-full max-w-xs bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner"
                        id="addr-zip"
                        maxLength={5}
                        placeholder="12345"
                        type="text"
                        value={userAddress.postalCode}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({
                            ...prev,
                            postalCode: true,
                          }))
                        }
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                          setUserAddress((prev) => ({ ...prev, postalCode: v }));
                        }}
                      />
                      {addressFieldBlurred.postalCode &&
                      addressValidation.errors.postalCode ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.postalCode}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </fieldset>
              </div>

              {llmError ? (
                <p className="text-sm text-error font-body" role="alert">
                  {llmError}
                </p>
              ) : null}

              {followUpLoading ? (
                <div
                  className="mt-8 pt-6 border-t border-outline-variant/15 space-y-3 transition-opacity duration-300 ease-out"
                  aria-live="polite"
                >
                  <p className="text-sm font-semibold text-primary font-headline">
                    Generating follow-up questions…
                  </p>
                  <LinearLoadingBar
                    estimatedSeconds={30}
                    label="Generating follow-up questions"
                    progress={followUpProgress}
                  />
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                <button
                  className="cursor-pointer gradient-primary text-on-primary px-8 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
                  disabled={!intakeValid || followUpLoading}
                  type="button"
                  onClick={() => void handleContinueToFollowUp()}
                >
                  {followUpLoading ? 'Preparing questions…' : 'Continue'}
                  <span className="material-symbols-outlined text-lg">
                    arrow_forward
                  </span>
                </button>
                {!intakeValid && (
                  <p className="text-xs text-on-surface-variant font-body">
                    Add symptoms, choose an insurer, and complete your address to
                    continue.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {step === 'followup' && (
          <div className="space-y-6">
            <div
              className={`bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 flex items-start gap-3 transition-opacity duration-300 ${
                followupRound1Busy ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <span className="material-symbols-outlined text-primary mt-0.5">
                auto_awesome
              </span>
              <div>
                <h3 className="text-sm font-bold text-primary mb-1 font-headline">
                  Follow-up questions
                </h3>
                <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                  These questions were generated from your symptom description to mirror
                  what a clinician might ask next. After you answer, we will check
                  whether a bit more detail helps before showing possible conditions.
                </p>
              </div>
            </div>

            <div className="relative">
              <section
                className={`bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost transition-opacity duration-300 ease-out ${
                  followupRound1Busy ? 'opacity-35 pointer-events-none' : 'opacity-100'
                }`}
              >
                <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">quiz</span>
                  Short questionnaire
                </h2>

                <div className="space-y-10">
                  {followUpQuestions.map((question) =>
                    renderFollowUpQuestion(question),
                  )}
                </div>

                {llmError ? (
                  <p className="mt-8 text-sm text-error font-body" role="alert">
                    {llmError}
                  </p>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-3 mt-10 pt-6 border-t border-outline-variant/15">
                  <button
                    className="cursor-pointer px-6 py-2.5 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    disabled={followupRound1Busy}
                    type="button"
                    onClick={() => {
                      setStep('intake');
                      setIntakeSubstep('form');
                      setFollowUpQuestions([]);
                      setFollowUpAnswers({});
                      setSecondFollowUpQuestions([]);
                      setSecondFollowUpAnswers({});
                      setLlmError(null);
                    }}
                  >
                    Back
                  </button>
                  <button
                    className="cursor-pointer gradient-primary text-on-primary px-8 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed sm:ml-auto"
                    disabled={!followUpValid || followupRound1Busy}
                    type="button"
                    onClick={() => void handleCheckAndProceed()}
                  >
                    {pendingRequest === 'followup_round_2'
                      ? 'Evaluating…'
                      : resultsLoading
                        ? 'Analyzing responses…'
                        : 'Continue'}
                    <span className="material-symbols-outlined text-lg">
                      monitoring
                    </span>
                  </button>
                </div>
              </section>

              {followupRound1Busy ? (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-surface-container-lowest/92 backdrop-blur-[2px] border border-outline-variant/20 p-5 md:p-8 shadow-ambient transition-opacity duration-300 ease-out"
                  aria-live="polite"
                >
                  <div className="w-full max-w-3xl space-y-3">
                    <p className="text-sm font-semibold text-primary font-headline">
                      {pendingRequest === 'followup_round_2'
                        ? 'Evaluating your answers…'
                        : 'Analyzing your responses…'}
                    </p>
                    <LinearLoadingBar
                      estimatedSeconds={30}
                      label={
                        pendingRequest === 'followup_round_2'
                          ? 'Evaluating your answers'
                          : 'Analyzing your responses'
                      }
                      progress={
                        pendingRequest === 'followup_round_2'
                          ? roundTwoRequestProgress
                          : resultsProgress
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {step === 'followup_round_2' && (
          <div className="space-y-6">
            <div
              className={`bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 flex items-start gap-3 transition-opacity duration-300 ${
                resultsLoading ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <span className="material-symbols-outlined text-primary mt-0.5">
                auto_awesome
              </span>
              <div>
                <h3 className="text-sm font-bold text-primary mb-1 font-headline">
                  Additional clarifying questions
                </h3>
                <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                  Based on your answers, we need a bit more detail to narrow the
                  illustrative assessment. Please answer the questions below.
                </p>
              </div>
            </div>

            <div className="relative">
              <section
                className={`bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost transition-opacity duration-300 ease-out ${
                  resultsLoading ? 'opacity-35 pointer-events-none' : 'opacity-100'
                }`}
              >
                <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">quiz</span>
                  Additional questions
                </h2>

                <div className="space-y-10">
                  {secondFollowUpQuestions.map((question) =>
                    renderSecondRoundQuestion(question),
                  )}
                </div>

                {llmError ? (
                  <p className="mt-8 text-sm text-error font-body" role="alert">
                    {llmError}
                  </p>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-3 mt-10 pt-6 border-t border-outline-variant/15">
                  <button
                    className="cursor-pointer px-6 py-2.5 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    disabled={resultsLoading}
                    type="button"
                    onClick={() => {
                      setStep('followup');
                      setSecondFollowUpQuestions([]);
                      setSecondFollowUpAnswers({});
                      setLlmError(null);
                    }}
                  >
                    Back
                  </button>
                  <button
                    className="cursor-pointer gradient-primary text-on-primary px-8 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed sm:ml-auto"
                    disabled={!secondFollowUpValid || resultsLoading}
                    type="button"
                    onClick={() => void handleSeeResults()}
                  >
                    {resultsLoading ? 'Analyzing responses…' : 'See results'}
                    <span className="material-symbols-outlined text-lg">
                      monitoring
                    </span>
                  </button>
                </div>
              </section>

              {resultsLoading ? (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-surface-container-lowest/92 backdrop-blur-[2px] border border-outline-variant/20 p-5 md:p-8 shadow-ambient transition-opacity duration-300 ease-out"
                  aria-live="polite"
                >
                  <div className="w-full max-w-3xl space-y-3">
                    <p className="text-sm font-semibold text-primary font-headline">
                      Analyzing your responses…
                    </p>
                    <LinearLoadingBar
                      estimatedSeconds={30}
                      label="Analyzing your responses"
                      progress={resultsProgress}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {step === 'results' && results && (
          <div
            className={`space-y-8 transition-opacity duration-500 ease-out ${
              resultsEntered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="bg-error-container/40 border border-error-container/50 rounded-xl p-5 flex gap-3 items-start">
              <span
                className="material-symbols-outlined text-on-error-container shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                medical_information
              </span>
              <div>
                <h3 className="font-headline font-bold text-on-surface text-sm mb-1">
                  Not a diagnosis or emergency instruction
                </h3>
                <p className="text-xs sm:text-sm text-on-surface-variant font-body leading-relaxed">
                  The list below illustrates conditions sometimes considered when
                  symptoms like yours are reported. Only a licensed clinician who
                  examines you can diagnose or advise urgency. If you believe you are
                  having an emergency, call 911 or go to the nearest emergency
                  department.
                </p>
              </div>
            </div>

            <div
              className={`rounded-xl px-5 py-4 flex flex-wrap items-center gap-3 border font-body text-sm ${severityStyles(results.overall_patient_severity)}`}
            >
              <span className="material-symbols-outlined text-xl">monitor_heart</span>
              <div>
                <p className="font-headline font-bold text-on-surface text-sm">
                  Overall reported acuity (illustrative)
                </p>
                <p className="text-on-surface-variant capitalize">
                  {results.overall_patient_severity}
                </p>
              </div>
            </div>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  neurology
                </span>
                Possible conditions (illustrative)
              </h2>
              <ul className="space-y-5">
                {results.conditions.map((d) => (
                  <li
                    key={d.title}
                    className="border-b border-outline-variant/10 last:border-0 pb-5 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <h3 className="font-headline text-base font-bold text-on-surface">
                        {d.title}
                      </h3>
                      <span
                        className={`text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full border shrink-0 ${severityStyles(d.condition_severity)}`}
                      >
                        {d.condition_severity}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                      {d.explanation}
                    </p>
                    <p className="text-sm text-on-surface font-body leading-relaxed mt-3">
                      <span className="font-semibold text-primary">
                        Why this is on the list:{' '}
                      </span>
                      {d.why_possible}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  local_hospital
                </span>
                Nearby hospitals
              </h2>
              <p className="text-xs text-on-surface-variant font-body mb-3 leading-relaxed">
                Order is <strong className="text-on-surface">relevance-aware</strong>:
                we combine straight-line distance with a heuristic score from the public
                NPI directory (name keywords, facility type, and multi-site signals).
                Patient reviews are <strong className="text-on-surface">not</strong> in
                that registry—so farther listings can rank higher when they look like
                established care sites.
              </p>
              <p className="text-xs text-on-surface-variant font-body mb-3 leading-relaxed">
                In-network labels use publicly posted payer transparency files when we
                have them for your selection—they are{' '}
                <strong className="text-on-surface">not</strong> eligibility checks. We
                still list nearby options either way; likely in-network rows are shown
                first when a directory match is available.
              </p>
              {insurance === 'fidelis' ? (
                <p className="text-xs text-on-surface-variant font-body mb-3 leading-relaxed rounded-lg border border-outline-variant/20 bg-surface-container-low/40 px-3 py-2">
                  <strong className="text-on-surface">Fidelis:</strong> posted
                  in-network files list individual clinician NPIs, while this step shows{' '}
                  <strong className="text-on-surface">
                    hospital-style organization NPIs
                  </strong>{' '}
                  from the public directory—so we do not mark in- or out-of-network for
                  that pairing.
                </p>
              ) : null}
              {nearbyTaxonomyUsed ? (
                <p className="text-xs text-on-surface-variant font-body mb-4">
                  Directory search used NUCC taxonomy code{' '}
                  <span className="font-mono text-on-surface">
                    {nearbyTaxonomyUsed}
                  </span>{' '}
                  from your assessment.
                </p>
              ) : null}

              {nearbyLoading ? (
                <p className="text-sm text-on-surface-variant font-body">
                  Loading nearby facilities…
                </p>
              ) : null}

              {nearbyError ? (
                <p className="text-sm text-error font-body" role="alert">
                  {nearbyError}
                </p>
              ) : null}

              {!nearbyLoading &&
              !nearbyError &&
              nearbyFacilities &&
              nearbyFacilities.length === 0 ? (
                <p className="text-sm text-on-surface-variant font-body">
                  No facilities matched this search. Try adjusting your ZIP or try again
                  later.
                </p>
              ) : null}

              {!nearbyLoading &&
              !nearbyError &&
              displayedNearbyFacilities.length > 0 ? (
                <div className="space-y-4">
                  <ul className="space-y-4">
                    {displayedNearbyFacilities.slice(0, 3).map((h) => {
                      const nw = facilityNetworkBadge(h);
                      return (
                        <li
                          key={h.npi}
                          className="flex flex-col gap-3 bg-surface rounded-xl p-4 border border-outline-variant/15"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div>
                              <p className="font-headline font-bold text-on-surface">
                                {h.name}
                              </p>
                              <p className="text-sm text-on-surface-variant font-body mt-1">
                                {h.address_line}
                              </p>
                              <p className="text-xs text-on-surface-variant/85 font-body mt-1">
                                {facilityListingFitLabel(h.relevance_score)}
                              </p>
                              <p className="mt-2">
                                <span className={nw.className}>{nw.label}</span>
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-md">
                                <span className="material-symbols-outlined text-base">
                                  near_me
                                </span>
                                {h.distance_label}
                              </span>
                              <a
                                className="inline-flex items-center gap-1 text-sm font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5 hover:bg-primary-fixed/10 transition-colors"
                                href={buildGoogleMapsUrl(h.address_line)}
                                rel="noreferrer"
                                target="_blank"
                              >
                                <span className="material-symbols-outlined text-base">
                                  map
                                </span>
                                Maps
                              </a>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {displayedNearbyFacilities.length > 3 ? (
                    <details className="rounded-xl border border-outline-variant/15 bg-surface px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary font-headline">
                        Show more facilities ({displayedNearbyFacilities.length - 3}{' '}
                        more)
                      </summary>
                      <ul className="mt-4 space-y-4">
                        {displayedNearbyFacilities.slice(3).map((h) => {
                          const nw = facilityNetworkBadge(h);
                          return (
                            <li
                              key={h.npi}
                              className="flex flex-col gap-3 border-t border-outline-variant/10 pt-4 first:border-t-0 first:pt-0"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                  <p className="font-headline font-bold text-on-surface">
                                    {h.name}
                                  </p>
                                  <p className="text-sm text-on-surface-variant font-body mt-1">
                                    {h.address_line}
                                  </p>
                                  <p className="text-xs text-on-surface-variant/85 font-body mt-1">
                                    {facilityListingFitLabel(h.relevance_score)}
                                  </p>
                                  <p className="mt-2">
                                    <span className={nw.className}>{nw.label}</span>
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                                  <span className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-md">
                                    <span className="material-symbols-outlined text-base">
                                      near_me
                                    </span>
                                    {h.distance_label}
                                  </span>
                                  <a
                                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5 hover:bg-primary-fixed/10 transition-colors"
                                    href={buildGoogleMapsUrl(h.address_line)}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    <span className="material-symbols-outlined text-base">
                                      map
                                    </span>
                                    Maps
                                  </a>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  payments
                </span>
                Estimated cost context
              </h2>
              <p className="text-sm text-on-surface-variant font-body mb-6">
                Illustrative guidance for{' '}
                <strong className="text-on-surface">{insurerLabel}</strong> — not a
                personal quote; typical ranges are educational only.
              </p>
              {priceEstimateLoading ? (
                <div className="bg-surface rounded-xl p-5 border border-outline-variant/15">
                  <LinearLoadingBar
                    label="Generating illustrative cost context"
                    estimatedSeconds={25}
                    progress={priceEstimateProgress}
                  />
                </div>
              ) : (
                <article className="bg-surface rounded-xl p-5 border border-outline-variant/15 space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary-fixed/8 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant font-headline mb-1">
                      Illustrative range (not your bill)
                    </p>
                    <p className="text-xl sm:text-2xl font-headline font-bold text-primary tracking-tight">
                      {effectivePriceEstimate.cost_range_label}
                    </p>
                  </div>
                  <p className="text-sm text-on-surface font-body leading-relaxed">
                    {effectivePriceEstimate.cost_range_explanation}
                  </p>
                  <div className="pt-2 border-t border-outline-variant/15 space-y-3">
                    {PRICE_ESTIMATE_STATIC_DISCLAIMER_PARAGRAPHS.map((para, i) => (
                      <p
                        key={`static-disclaimer-${i}`}
                        className="text-sm text-on-surface-variant font-body leading-relaxed"
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                </article>
              )}
            </section>

            <div className="flex flex-wrap gap-3 justify-center">
              <button
                className="cursor-pointer gradient-primary text-on-primary px-8 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all"
                type="button"
                onClick={restart}
              >
                Start a new check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SymptomCheckPage;
