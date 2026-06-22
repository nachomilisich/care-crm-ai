import { callLLM, HarnessOutput } from "../harness";

export interface FamilyAgentInput {
  residentName: string;
  facilityName: string;
  careSummary: string;
}

export async function runFamilyAgent(
  input: FamilyAgentInput,
): Promise<HarnessOutput> {
  return await callLLM({
    system: `You are a family communication specialist for a residential care facility.
Your job is to write warm, clear, plain-language summaries for families of new residents.
Avoid medical jargon. Be compassionate and reassuring.`,
    prompt: `Write a welcome summary for the family of ${input.residentName}, 
who is joining ${input.facilityName}.

Based on this care information:
${input.careSummary}

The summary should:
- Welcome the resident and family warmly
- Briefly explain the care plan in plain language
- Mention what to expect in the first week
- Include an invitation to ask questions`,
  });
}
