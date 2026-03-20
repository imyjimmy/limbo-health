function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

export async function extractPdfFormUnderstandingWithOpenAI({
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  userPrompt,
  schema,
  timeoutMs = 30000,
}) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for PDF form understanding.');
  }

  if (!model) {
    throw new Error('OPENAI_PDF_FORM_MODEL is required for PDF form understanding.');
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(joinUrl(baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pdf_form_understanding',
            strict: true,
            schema,
          },
        },
      }),
      signal: abortController.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        `OpenAI request failed with status ${response.status}: ${payload?.error?.message || 'Unknown error.'}`,
      );
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('OpenAI response did not include structured JSON content.');
    }

    return {
      output: JSON.parse(content),
      responseId: payload?.id || null,
      usage: payload?.usage || null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
