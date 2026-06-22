import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- TYPES ---
export interface HarnessInput {
  system: string;
  prompt: string;
  timeoutMs?: number;
}

export interface HarnessOutput {
  success: boolean;
  result?: string;
  error?: string;
  attempts: number;
}

// --- LOGGING ---
function log(level: "INFO" | "WARN" | "ERROR", message: string, data?: any) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data: redactSensitive(data) }),
  };
  console.log(JSON.stringify(entry, null, 2));
}

function redactSensitive(obj: any): any {
  const sensitiveKeys = [
    "apiKey",
    "api_key",
    "password",
    "token",
    "ssn",
    "dateOfBirth",
    "date_of_birth",
  ];
  if (typeof obj !== "object" || obj === null) return obj;
  const redacted = { ...obj };
  for (const key of Object.keys(redacted)) {
    if (
      sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))
    ) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object") {
      redacted[key] = redactSensitive(redacted[key]);
    }
  }
  return redacted;
}

// --- CIRCUIT BREAKER ---
class CircuitBreaker {
  private failures = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private openedAt: number | null = null;
  private readonly threshold = 5;
  private readonly timeoutMs = 30000;

  async execute(fn: () => Promise<any>): Promise<any> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.openedAt!;
      if (elapsed > this.timeoutMs) {
        this.state = "HALF_OPEN";
        log("WARN", "Circuit breaker is HALF_OPEN — testing recovery");
      } else {
        throw new Error("Circuit breaker OPEN — service unavailable");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
      log(
        "ERROR",
        `Circuit breaker OPEN after ${this.failures} consecutive failures`,
      );
    }
  }

  getState() {
    return this.state;
  }
}

const circuitBreaker = new CircuitBreaker();

// --- MAIN HARNESS ---
export async function callLLM(input: HarnessInput): Promise<HarnessOutput> {
  const maxRetries = 3;
  const timeoutMs = input.timeoutMs ?? 30000;
  let attempts = 0;

  log("INFO", "LLM call initiated", {
    system: input.system,
    prompt: input.prompt,
  });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++;
    try {
      const result = await circuitBreaker.execute(async () => {
        // Timeout wrapper
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs),
        );

        const apiCall = client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: input.system,
          messages: [{ role: "user", content: input.prompt }],
        });

        return await Promise.race([apiCall, timeoutPromise]);
      });

      const text =
        result.content[0].type === "text" ? result.content[0].text : "";

      log("INFO", "LLM call successful", {
        attempts,
        responseLength: text.length,
      });

      return { success: true, result: text, attempts };
    } catch (error: any) {
      const isRateLimit = error.status === 429;
      const isServerError = error.status === 500 || error.status === 529;
      const isTimeout = error.message === "TIMEOUT";
      const isCircuitOpen = error.message.includes("Circuit breaker OPEN");
      const isLastAttempt = attempt === maxRetries - 1;

      log("WARN", `Attempt ${attempts} failed`, {
        error: error.message,
        status: error.status,
        isRateLimit,
        isServerError,
        isTimeout,
      });

      // If circuit is open or last attempt, return fallback
      if (isCircuitOpen || isLastAttempt) {
        log("ERROR", "Fallback activated — LLM call could not be completed", {
          attempts,
        });
        return {
          success: false,
          error: error.message,
          attempts,
        };
      }

      // Only retry on recoverable errors
      if (!isRateLimit && !isServerError && !isTimeout) {
        return { success: false, error: error.message, attempts };
      }

      // Exponential backoff
      const waitMs = Math.pow(2, attempt) * 1000;
      log("WARN", `Retrying in ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return { success: false, error: "Max retries reached", attempts };
}
