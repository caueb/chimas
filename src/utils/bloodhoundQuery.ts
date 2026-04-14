/**
 * Generates a Cypher query for BloodHound/Neo4j to find affected computers.
 *
 * When insecure GPOs exist: finds computers linked to those GPOs (directly affected).
 * When only secure GPOs exist: finds computers NOT linked to those GPOs (lacking hardening).
 * When no GPOs exist: returns all enabled computers.
 */
export function generateBloodHoundQuery(secureGPOs: string[], insecureGPOs: string[]): string {
  // If there are insecure GPOs, find computers affected by them
  if (insecureGPOs.length > 0) {
    const gpoArray = insecureGPOs.map(name => `  '${name.toUpperCase()}'`).join(',\n');

    return `WITH [
${gpoArray}
] AS prefixes

// Find enabled computers affected by misconfigured GPOs
MATCH (g:GPO)
WHERE ANY(p IN prefixes WHERE toUpper(g.name) STARTS WITH toUpper(p))
MATCH (g)-[:GPLink|Contains*1..]->(c:Computer {enabled:true})
RETURN DISTINCT c.name
ORDER BY c.name;`;
  }

  // If there are only secure GPOs, find computers NOT covered by them
  if (secureGPOs.length > 0) {
    const gpoArray = secureGPOs.map(name => `  '${name.toUpperCase()}'`).join(',\n');

    return `WITH [
${gpoArray}
] AS prefixes

// Step 1: collect all enabled computers covered by hardening GPOs
MATCH (g:GPO)
WHERE ANY(p IN prefixes WHERE toUpper(g.name) STARTS WITH toUpper(p))
MATCH (g)-[:GPLink|Contains*1..]->(comp:Computer {enabled:true})
WITH COLLECT(DISTINCT comp) AS gpoLinked

// Step 2: return enabled computers not in that set
MATCH (c:Computer {enabled:true})
WHERE NOT c IN gpoLinked
RETURN c.name
ORDER BY c.name;`;
  }

  // No GPOs at all — all computers are potentially affected
  return `// No GPOs found configuring this setting
// All enabled computers are potentially affected

MATCH (c:Computer {enabled:true})
RETURN c.name
ORDER BY c.name;`;
}

/**
 * Copy text to clipboard using the Clipboard API
 * @returns Promise that resolves to true on success, false on failure
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

