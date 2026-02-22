export interface MedicationFields {
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  stopDate?: string;
}

export interface ParsedMedicationEntry {
  isMedicationEntry: boolean;
  fields: MedicationFields | null;
}

function extractFromBody(body: string): MedicationFields | null {
  const nameMatch = body.match(/^#\s+(.+)$/m);
  const dosageMatch = body.match(/^-+\s*Dosage:\s*(.+)$/im);
  const frequencyMatch = body.match(/^-+\s*Frequency:\s*(.+)$/im);
  const startDateMatch = body.match(/^-+\s*(Started|Start Date):\s*(.+)$/im);
  const stopDateMatch = body.match(/^-+\s*(Stopped|Stop Date):\s*(.+)$/im);
  if (!nameMatch || !dosageMatch || !frequencyMatch) return null;

  return {
    name: nameMatch[1].trim(),
    dosage: dosageMatch[1].trim(),
    frequency: frequencyMatch[1].trim(),
    startDate: startDateMatch?.[2]?.trim() ?? '',
    stopDate: stopDateMatch?.[2]?.trim() || undefined,
  };
}

export function buildMedicationMarkdown(fields: MedicationFields): string {
  const lines = [
    `# ${fields.name}`,
    '',
    `- Dosage: ${fields.dosage}`,
    `- Frequency: ${fields.frequency}`,
    `- Started: ${fields.startDate}`,
  ];

  if (fields.stopDate?.trim()) {
    lines.push(`- Stopped: ${fields.stopDate.trim()}`);
  }

  return lines.join('\n');
}

export function parseMedicationEntry(markdown: string): ParsedMedicationEntry {
  const parsed = extractFromBody(markdown);
  if (parsed) {
    return {
      isMedicationEntry: true,
      fields: parsed,
    };
  }

  return {
    isMedicationEntry: false,
    fields: null,
  };
}
