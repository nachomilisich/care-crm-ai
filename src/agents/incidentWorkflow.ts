import { callLLM } from "../harness";

// --- TYPES ---
export interface IncidentReport {
  reportedBy: string;
  residentName: string;
  dateTime: string;
  description: string;
  witnessNames?: string;
  immediateActionTaken?: string;
}

export interface AuditTrail {
  incidentId: string;
  startedAt: string;
  completedAt: string;
  classification: string | null;
  regulatoryPath: string | null;
  validationIterations: number;
  converged: boolean;
  escalatedToHuman: boolean;
  steps: AuditStep[];
  finalStatus: "COMPLETE" | "ESCALATED";
}

interface AuditStep {
  step: string;
  timestamp: string;
  result: string;
}

// --- HELPERS ---
function generateIncidentId(): string {
  return "INC-" + Date.now();
}

function addStep(trail: AuditTrail, step: string, result: string) {
  trail.steps.push({
    step,
    timestamp: new Date().toISOString(),
    result,
  });
}

// --- STEP 1: CLASSIFY ---
async function classifyIncident(
  report: IncidentReport,
): Promise<string | null> {
  const response = await callLLM({
    system: `You are an incident classification specialist for a residential care facility.
Classify incidents into exactly one of these categories:
- FALL: resident fell or was found on the floor
- MEDICATION_ERROR: wrong medication, dose, or timing
- BEHAVIORAL: aggressive or self-harm behavior
- MEDICAL_EMERGENCY: sudden health deterioration
- ABUSE_NEGLECT: suspected abuse or neglect
- ELOPEMENT: resident left facility unsupervised
- OTHER: anything that doesn't fit above

Respond with ONLY the category name, nothing else.`,
    prompt: `Classify this incident:\n${report.description}`,
  });

  return response.success ? (response.result?.trim() ?? null) : null;
}

// --- STEP 2: ROUTE ---
function getRegulatoryPath(classification: string): string {
  const routes: Record<string, string> = {
    FALL: "Document in medical record. Notify physician within 24h. Family notification required. State report if hospitalization results.",
    MEDICATION_ERROR:
      "Notify physician immediately. Document in MAR. Pharmacist consultation required. State report within 24h.",
    BEHAVIORAL:
      "Notify physician and family. Behavior plan review required. Document in clinical notes.",
    MEDICAL_EMERGENCY:
      "Call 911 if needed. Notify physician immediately. Family notification within 1h. State report within 24h.",
    ABUSE_NEGLECT:
      "Mandatory state report within 2h. Notify administrator immediately. Preserve evidence. Do not confront alleged abuser.",
    ELOPEMENT:
      "Call 911 immediately. Notify family and administrator. State report required. Safety assessment mandatory.",
    OTHER: "Document thoroughly. Supervisor review required within 24h.",
  };

  return routes[classification] ?? routes["OTHER"];
}

// --- STEP 3: VALIDATE LOOP ---
async function validateIncidentFields(
  report: IncidentReport,
  classification: string,
  iteration: number,
): Promise<{ valid: boolean; missingFields: string[] }> {
  const response = await callLLM({
    system: `You are a compliance validator for incident reports at a residential care facility.
Check if the incident report has all required fields for the given classification.
Respond ONLY with valid JSON in this exact format:
{"valid": true} or {"valid": false, "missingFields": ["field1", "field2"]}`,
    prompt: `Incident classification: ${classification}
    
Report data:
- Reported by: ${report.reportedBy}
- Resident: ${report.residentName}
- Date/Time: ${report.dateTime}
- Description: ${report.description}
- Witnesses: ${report.witnessNames ?? "NOT PROVIDED"}
- Immediate action taken: ${report.immediateActionTaken ?? "NOT PROVIDED"}

Iteration: ${iteration}

Check for these required fields based on classification:
- All incidents: reportedBy, residentName, dateTime, description, immediateActionTaken
- FALL: witnessNames (if anyone was present)
- MEDICATION_ERROR: specific medication name in description, dose mentioned
- ABUSE_NEGLECT: witnessNames required, specific allegation in description
- MEDICAL_EMERGENCY: immediateActionTaken required with specific actions listed`,
  });

  if (!response.success || !response.result) {
    return { valid: false, missingFields: ["Unable to validate — LLM error"] };
  }

  try {
    const cleaned = response.result.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { valid: false, missingFields: ["Invalid validation response"] };
  }
}

// --- MAIN WORKFLOW ---
export async function runIncidentWorkflow(
  report: IncidentReport,
): Promise<AuditTrail> {
  const MAX_ITERATIONS = 3;

  const trail: AuditTrail = {
    incidentId: generateIncidentId(),
    startedAt: new Date().toISOString(),
    completedAt: "",
    classification: null,
    regulatoryPath: null,
    validationIterations: 0,
    converged: false,
    escalatedToHuman: false,
    steps: [],
    finalStatus: "ESCALATED",
  };

  console.log(`\n🚨 Starting incident workflow: ${trail.incidentId}`);

  // STEP 1: Classify
  console.log("Step 1: Classifying incident...");
  const classification = await classifyIncident(report);

  if (!classification) {
    addStep(trail, "CLASSIFICATION", "FAILED — LLM error");
    trail.completedAt = new Date().toISOString();
    trail.escalatedToHuman = true;
    return trail;
  }

  trail.classification = classification;
  addStep(trail, "CLASSIFICATION", classification);
  console.log(`✅ Classified as: ${classification}`);

  // STEP 2: Route
  console.log("Step 2: Routing to regulatory path...");
  const regulatoryPath = getRegulatoryPath(classification);
  trail.regulatoryPath = regulatoryPath;
  addStep(trail, "ROUTING", regulatoryPath);
  console.log(`✅ Regulatory path assigned`);

  // STEP 3: Validation loop
  console.log("Step 3: Validating required fields...");

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    trail.validationIterations = i;
    console.log(`  Validation iteration ${i}/${MAX_ITERATIONS}...`);

    const validation = await validateIncidentFields(report, classification, i);

    if (validation.valid) {
      trail.converged = true;
      trail.finalStatus = "COMPLETE";
      addStep(
        trail,
        `VALIDATION_ITERATION_${i}`,
        "PASSED — all required fields present",
      );
      console.log(`✅ Validation passed on iteration ${i}`);
      break;
    } else {
      addStep(
        trail,
        `VALIDATION_ITERATION_${i}`,
        `FAILED — missing: ${validation.missingFields.join(", ")}`,
      );
      console.log(
        `  ⚠️  Missing fields: ${validation.missingFields.join(", ")}`,
      );

      if (i === MAX_ITERATIONS) {
        // Loop guard triggered
        trail.escalatedToHuman = true;
        trail.finalStatus = "ESCALATED";
        addStep(
          trail,
          "LOOP_GUARD",
          `Max iterations (${MAX_ITERATIONS}) reached — escalating to human reviewer`,
        );
        console.log(`❌ Loop guard triggered — escalating to human reviewer`);
      }
    }
  }

  trail.completedAt = new Date().toISOString();
  return trail;
}
