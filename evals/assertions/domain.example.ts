type AssertionContext = {
  vars?: Record<string, unknown>;
  test?: {
    metadata?: Record<string, unknown>;
  };
};

export default function assertUsefulResponse(
  output: string,
  context: AssertionContext,
): { pass: boolean; score: number; reason: string } {
  const caseId = context.test?.metadata?.caseId;
  const hasContent = output.trim().length >= 80;
  const identifiesLimitation = /\b(limitation|constraint|cannot|does not)\b/i.test(output);
  const pass = hasContent && identifiesLimitation;

  return {
    pass,
    score: Number(hasContent) * 0.5 + Number(identifiesLimitation) * 0.5,
    reason: pass
      ? `Case ${String(caseId)} passed deterministic domain checks`
      : 'Response must contain substantive content and identify a limitation',
  };
}
