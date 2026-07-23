export function enforce_provenance(text, source, confidence) {
  return `${text} % [PROVENANCE: source=${source}, confidence=${confidence}]`;
}

export function review_draft({ section_content }) {
  const lines = section_content.split('\n');
  const unverifiedClaims = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('% [PROVENANCE:') && line.includes('confidence=UNVERIFIED]')) {
      unverifiedClaims.push({
        line_number: i + 1,
        claim: line.trim()
      });
    }
  }
  
  if (unverifiedClaims.length === 0) {
    return { status: 'Draft looks good. No UNVERIFIED claims found.' };
  }
  
  return { 
    status: 'Found UNVERIFIED claims that need review.', 
    unverified_claims: unverifiedClaims 
  };
}

export async function draft_section({ topic, memory_context }) {
  const prompt = `Draft a LaTeX section about: ${topic}. 
Use the provided memory context to support your claims.
CRITICAL INSTRUCTION: Every single generated claim MUST end with a provenance tag as a LaTeX comment.
Format: % [PROVENANCE: source=<source>, confidence=<confidence>]

Rules for tags:
1. If derived from user notes in context: source=user_notes, confidence=stated
2. If derived from a cited paper in context: source=arxiv:<id> or paper_id, confidence=cited
3. If synthesized or extrapolated without direct source: source=generated, confidence=UNVERIFIED

Context:
${memory_context}
`;
  return { instructions: 'Pass this prompt to the ask_gemini tool to generate the draft.', prompt };
}

export async function auto_literature_to_outline({ papers_context, topic }) {
  const prompt = `Synthesize a structured outline for a paper/section about: ${topic}.
Based on the following papers context:
${papers_context}

CRITICAL INSTRUCTION: Pre-place citations for all claims in the outline using the format \\cite{arxiv_id} or \\cite{paper_id}. Do not simply list the papers; synthesize them into a logical thematic outline.`;
  return { instructions: 'Pass this prompt to the ask_gemini tool to generate the outline.', prompt };
}

export async function contradiction_detector({ papers_context, topic }) {
  const prompt = `Analyze the following papers context on the topic of: ${topic}.
Identify and explicitly flag any contradictions, disagreements, or conflicting claims between the cited papers.
Format your output as a list of contradictions, specifying which papers disagree and the nature of the disagreement.
If no contradictions are found, state "No contradictions found."

Papers Context:
${papers_context}`;
  return { instructions: 'Pass this prompt to the ask_gemini tool to detect contradictions.', prompt };
}
