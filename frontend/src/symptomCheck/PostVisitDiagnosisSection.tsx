import React from "react";
import { PostVisitDiagnosisEditor } from "./PostVisitDiagnosisEditor";
import type { PostVisitDiagnosis } from "./postVisitDiagnosisTypes";

type Props = {
  sessionId: string;
  conditionTitles: string[];
  saved: PostVisitDiagnosis | null;
  showEntryForm: boolean;
  onSaved?: (diagnosis: PostVisitDiagnosis) => void;
};

/** Symptom Check results: deferred entry + link to `/after-visit/:sessionId`. */
export const PostVisitDiagnosisSection: React.FC<Props> = ({
  sessionId,
  conditionTitles,
  saved,
  showEntryForm,
  onSaved,
}) => (
  <PostVisitDiagnosisEditor
    sessionId={sessionId}
    conditionTitles={conditionTitles}
    saved={saved}
    entryMode="defer"
    allowDeferredEntry={showEntryForm}
    offerDedicatedFlow
    onSaved={onSaved}
  />
);
