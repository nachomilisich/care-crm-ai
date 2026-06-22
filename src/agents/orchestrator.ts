import { runMedicalAgent } from "./medicalAgent";
import { runComplianceAgent } from "./complianceAgent";
import { runFamilyAgent } from "./familyAgent";

export interface IntakeForm {
  residentName: string;
  facilityName: string;
  state: string;
  clinicalNotes: string;
  carePlan: string;
}

export interface OrchestratorResult {
  residentName: string;
  completedAt: string;
  medicalSummary: string | null;
  complianceReport: string | null;
  familyWelcome: string | null;
  failures: string[];
  success: boolean;
}

export async function runIntakeOrchestrator(
  form: IntakeForm,
): Promise<OrchestratorResult> {
  console.log(`\n🏥 Starting intake workflow for: ${form.residentName}\n`);

  const result: OrchestratorResult = {
    residentName: form.residentName,
    completedAt: new Date().toISOString(),
    medicalSummary: null,
    complianceReport: null,
    familyWelcome: null,
    failures: [],
    success: false,
  };

  // --- MEDICAL AGENT ---
  console.log("Running medical agent...");
  const medicalResult = await runMedicalAgent({
    residentName: form.residentName,
    clinicalNotes: form.clinicalNotes,
  });

  if (medicalResult.success && medicalResult.result) {
    result.medicalSummary = medicalResult.result;
    console.log("✅ Medical agent completed");
  } else {
    result.failures.push("medicalAgent: " + medicalResult.error);
    console.log("❌ Medical agent failed — continuing workflow");
  }

  // --- COMPLIANCE AGENT ---
  console.log("Running compliance agent...");
  const complianceResult = await runComplianceAgent({
    carePlan: form.carePlan,
    state: form.state,
  });

  if (complianceResult.success && complianceResult.result) {
    result.complianceReport = complianceResult.result;
    console.log("✅ Compliance agent completed");
  } else {
    result.failures.push("complianceAgent: " + complianceResult.error);
    console.log("❌ Compliance agent failed — continuing workflow");
  }

  // --- FAMILY AGENT ---
  console.log("Running family communication agent...");
  const familyResult = await runFamilyAgent({
    residentName: form.residentName,
    facilityName: form.facilityName,
    careSummary: result.medicalSummary ?? form.carePlan,
  });

  if (familyResult.success && familyResult.result) {
    result.familyWelcome = familyResult.result;
    console.log("✅ Family agent completed");
  } else {
    result.failures.push("familyAgent: " + familyResult.error);
    console.log("❌ Family agent failed — continuing workflow");
  }

  // --- FINAL STATUS ---
  result.success = result.failures.length === 0;

  if (result.failures.length > 0) {
    console.log(
      `\n⚠️  Workflow completed with ${result.failures.length} failure(s):`,
    );
    result.failures.forEach((f) => console.log(`   - ${f}`));
  } else {
    console.log("\n✅ All agents completed successfully");
  }

  return result;
}
