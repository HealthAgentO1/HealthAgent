/**
 * Helper to parse and extract JSON from LLM responses
 */

export const parseLlmJson = (text: string): Record<string, any> | null => {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from the text
    // Look for content between curly braces
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        console.error("Failed to parse extracted JSON:", jsonMatch[0]);
        return null;
      }
    }
    return null;
  }
};
