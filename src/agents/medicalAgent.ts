import { callLLM, HarnessOutput } from "../harness";

export interface MedicalAgentInput {
  clinicalNotes: string;
  residentName: string;
}

export async function runMedicalAgent(
  input: MedicalAgentInput,
): Promise<HarnessOutput> {
  return await callLLM({
    system: `You are a medical history specialist for a residential care facility. 
Your job is to parse clinical notes and produce a clear, structured summary 
that care staff can quickly understand. Always be concise and accurate.`,
    prompt: `Parse and summarize the following clinical notes for resident ${input.residentName}:

${input.clinicalNotes}

Return a structured summary with:
- Primary conditions
- Current medications
- Mobility status
- Dietary restrictions
- Key care alerts`,
  });
}
