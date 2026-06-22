import { callLLM, HarnessOutput } from "../harness";

export interface ComplianceAgentInput {
  carePlan: string;
  state: string;
}

export async function runComplianceAgent(
  input: ComplianceAgentInput,
): Promise<HarnessOutput> {
  return await callLLM({
    system: `You are a regulatory compliance specialist for residential care facilities.
Your job is to validate care plans against state requirements and flag any missing 
or non-compliant elements. Be specific about what is missing and why it matters.`,
    prompt: `Validate the following care plan for compliance with ${input.state} state regulations:

${input.carePlan}

Check for:
- Required documentation fields
- Mandatory care plan sections
- Staffing ratio requirements mentioned
- Emergency contact information
- Physician sign-off requirements

Return a compliance report with: COMPLIANT or NON-COMPLIANT status, and list any issues found.`,
  });
}
